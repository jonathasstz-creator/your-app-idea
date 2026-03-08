// @ts-nocheck
console.log('[INIT] 🚀 index.tsx loading - starting imports...');

import './styles.css';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OsmdController } from './osmd-controller';
import { UIService } from './ui-service';
import { PianoRollController } from './piano-roll-controller';
import { AudioService } from './audio-service';
import { buildV1CursorMapping, buildV2StepToCursorMapping } from './mapping-engine';
import { buildBeatToXMappingV1, buildBeatToXMappingV2 } from './beat-to-x-mapping';
import { toNum, isNumber } from './utils';
import { parseAndRoute } from './lesson-pipeline';
import { deriveRenderNotesFromV2Steps } from './lesson-render-notes';
import { LessonOrchestrator } from './lesson-orchestrator';
import {
    AnalyticsClient,
    AnalyticsClientError,
    type AnalyticsSource,
    type StatsViewModel,
} from './analytics-client';
import Dashboard from './piano-pro-dashboard';
import Home from './pianopro-home';
import Hub from './piano-pro-hub';
import { KEY_TO_MIDI, MIDI_TO_KEY_LABEL, DEBUG_NOTE_RANGE, type DebugInputSource } from './keyboardNoteMap';
import { TransportMetronome } from './transport-metronome';
import { WebMidiService, type MidiNoteEvent, type MidiServiceState } from './webmidi-service';
// NEW ENGINES
import { LocalTransportDriver, TransportSnapshot } from './local-transport-driver';
import { createEngineV1, createEngineV2, type LessonEngineApi, ViewState } from './lesson-engine';
import { LessonContentPacket, LessonMode, LessonStepV2 } from './types';
// TRANSPORT LAYER
import { createTransport, type ITransport } from './transport/factory';
import type { WsState } from './transport/ws-transport';
import { CatalogService } from './catalog-service';
// ENDSCREEN
import { EndscreenContainer, useTaskResult } from './components/Endscreen';
import { computeTaskResult, dispatchTaskCompletion } from './services/taskCompletion';
import { LessonTransposer } from './services/lesson-transposer';
import { LessonTimer, maybeStartLessonTimer } from './lesson-timer';
import { LessonSessionController } from './lesson-session-controller';
import { ensureAuthenticated, authService } from './auth/index';
import { getAuthTokenFromStorage, clearAuthStorage } from './auth-storage';
import { SettingsPage } from './settings';
import { featureFlags } from './feature-flags/store';
import { createRemoteFlagProvider } from './feature-flags/providers/remote';
import { FeatureFlags } from './feature-flags/types';
import { TrailNavigator } from './components/TrailNavigator';

console.log('[INIT] ✅ All imports loaded successfully!');

type ConnectionState = {
    isConnected: boolean;
    deviceName: string;
};

type EventV1 =
    | { type: "session_start"; session_id: string | null; lesson_id: string | null; seq: number; t_ms: number; mode: LessonMode; total_steps: number | null }
    | { type: "session_end"; session_id: string | null; lesson_id: string | null; seq: number; t_ms: number; reason?: string }
    | { type: "note_on"; session_id: string | null; lesson_id: string | null; seq: number; t_ms: number; midi: number; source?: string }
    | { type: "note_result"; session_id: string | null; lesson_id: string | null; seq: number; t_ms: number; result: "HIT" | "MISS" | "LATE"; step: number; expected?: number; played?: number; streak: number; score: number };

let eventStream: EventV1[] = [];
let eventSeq = 0;
let t0Perf = 0;
let filmHudFlash: { status: "HIT" | "MISS" | "LATE"; untilMs: number } | null = null;
let featureFlagSnapshot: FeatureFlags = featureFlags.snapshot();
// Declare lessonTimer and sessionController at module scope so pushEvent can access them
let lessonTimer: LessonTimer;
let sessionController: LessonSessionController | null = null;

const resetEventStream = (sessionId: string | null, lessonId: string | null, mode: LessonMode, totalSteps: number | null) => {
    eventStream = [];
    eventSeq = 0;
    t0Perf = performance.now();
    // Stop timer on reset
    if (typeof lessonTimer !== 'undefined') lessonTimer.reset();
    pushEvent("session_start", { session_id: sessionId, lesson_id: lessonId, mode, total_steps: totalSteps });
};

const pushEvent = (type: EventV1["type"], payload: Omit<EventV1, "type" | "seq" | "t_ms">) => {
    eventSeq += 1;
    const t_ms = Math.round(performance.now() - t0Perf);

    // Start timer on first note activity (guarded: never after lesson ends)
    maybeStartLessonTimer(type, typeof lessonTimer !== 'undefined' ? lessonTimer : undefined, sessionController?.isEnded() ?? false);

    eventStream.push({ ...(payload as any), type, seq: eventSeq, t_ms });
};

const flashFilmStatus = (status: "HIT" | "MISS" | "LATE", ms: number = FILM_FLASH_MS) => {
    filmHudFlash = { status, untilMs: performance.now() + ms };
};

const HOME_CONNECTION_EVENT = 'viewer-home-connection';
const homeConnectionSignal = new EventTarget();

const emitConnectionStatus = (detail: ConnectionState) => {
    homeConnectionSignal.dispatchEvent(
        new CustomEvent<ConnectionState>(HOME_CONNECTION_EVENT, { detail })
    );
};

const HOME_BACKEND_EVENT = 'viewer-home-backend';
const homeBackendSignal = new EventTarget();

type BackendState = { connected: boolean; label: string };

const emitBackendStatus = (detail: BackendState) => {
    homeBackendSignal.dispatchEvent(
        new CustomEvent<BackendState>(HOME_BACKEND_EVENT, { detail })
    );
};

const HomeShell: React.FC<{ onStartSession: (activity: unknown) => void }> = ({
    onStartSession,
}) => {
    const [view, setView] = React.useState<'home' | 'hub'>('home');
    const [connectionState, setConnectionState] = React.useState<ConnectionState>({
        isConnected: false,
        deviceName: 'Aguardando conexão...',
    });
    const [backendState, setBackendState] = React.useState<BackendState>({
        connected: false,
        label: 'Desconectado',
    });

    React.useEffect(() => {
        const handleConnection = (event: Event) => {
            const custom = event as CustomEvent<ConnectionState>;
            if (custom.detail) {
                setConnectionState(custom.detail);
            }
        };
        homeConnectionSignal.addEventListener(HOME_CONNECTION_EVENT, handleConnection);
        return () => {
            homeConnectionSignal.removeEventListener(HOME_CONNECTION_EVENT, handleConnection);
        };
    }, []);

    React.useEffect(() => {
        const handleBackend = (event: Event) => {
            const custom = event as CustomEvent<BackendState>;
            if (custom.detail) {
                setBackendState(custom.detail);
            }
        };
        homeBackendSignal.addEventListener(HOME_BACKEND_EVENT, handleBackend);
        return () => {
            homeBackendSignal.removeEventListener(HOME_BACKEND_EVENT, handleBackend);
        };
    }, []);

    return view === 'hub' ? (
        <Hub
            onBack={() => setView('home')}
            onSelectActivity={(activity) => {
                setView('home');
                onStartSession(activity);
            }}
            catalogService={catalogService}
        />
    ) : (
        <Home
            onStart={() => setView('hub')}
            isConnected={connectionState.isConnected}
            deviceName={connectionState.deviceName}
            backendConnected={backendState.connected}
            backendLabel={backendState.label}
        />
    );
};

type DashboardStatus = "idle" | "loading" | "live" | "stale" | "error";
type DashboardViewState = {
    status: DashboardStatus;
    stats: StatsViewModel | null;
    source?: AnalyticsSource | "cache";
    lastUpdated?: number | null;
    error?: string | null;
};

type MidiStatusMessage = {
    type: "midi_status";
    ports?: string[];
    connected?: boolean;
    active_port?: string | null;
    selected_port?: string | null;
    requested_port?: string | null;
    error?: string | null;
};

const LOCAL_UUID_KEY = "local_user_uuid";
const ANALYTICS_RETRY_DELAY_MS = 5000;
const FILM_PIXELS_PER_BEAT = 90;
const V2_DYNAMIC_MEASURE_LAYOUT =
    (import.meta as any).env?.VITE_V2_DYNAMIC_MEASURE_LAYOUT
        ? String((import.meta as any).env.VITE_V2_DYNAMIC_MEASURE_LAYOUT).toLowerCase() === "true"
        : true;
const FILM_FLASH_MS = 600;
const CHAPTER_CATALOG_TIMEOUT_MS = 3000;
const WS_RECONNECT_BASE_DELAY = 250;
const WS_RECONNECT_MAX_DELAY = 5000;

const isValidUuid = (value: unknown): value is string =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim()
    );

const persistLocalUserUuid = (value?: string | null) => {
    if (!value || !isValidUuid(value)) return;
    try {
        localStorage.setItem(LOCAL_UUID_KEY, value.trim());
    } catch {
        // ignore storage failures
    }
};

const bootstrapLocalUuidFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("luuid") ?? params.get("local_user_uuid");
    if (!candidate || !isValidUuid(candidate)) return;
    persistLocalUserUuid(candidate.trim());
    params.delete("luuid");
    params.delete("local_user_uuid");
    const cleanQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash
        }`;
    window.history.replaceState({}, "", cleanUrl);
};

bootstrapLocalUuidFromUrl();

const formatDashboardError = (error: unknown): string => {
    if (error instanceof AnalyticsClientError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Analytics indisponível";
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const debugInputLogging = localStorage.getItem("debug_input") === "1";

import { getConfig, buildApiUrl as centralBuildApiUrl, getApiBaseUrl } from '../config/app-config';

const API_BASE_URL = getConfig().apiBaseUrl;
let useRestSessionLesson = String(
    (import.meta as any).env?.VITE_USE_REST_SESSION_LESSON ?? "true"
).toLowerCase() !== "false";
let restSessionDisabledReason: string | null = null;
let practiceMode: LessonMode = "WAIT";
const SESSION_CLIENT_VERSION = (import.meta as any).env?.npm_package_version ?? "0.0.0";
const getAuthToken = (): string | null => getAuthTokenFromStorage();

const buildAuthHeaders = (): Headers => {
    const headers = new Headers();
    const token = getAuthToken();
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
};

const buildApiUrl = (path: string): string => centralBuildApiUrl(path);

const fetchWithAuth = async (path: string, options: RequestInit = {}): Promise<any> => {
    const endpoint = buildApiUrl(path);
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const authHeaders = buildAuthHeaders();
    authHeaders.forEach((value, key) => {
        if (!headers.has(key)) {
            headers.set(key, value);
        }
    });

    const response = await fetch(endpoint, {
        ...options,
        headers,
        credentials: 'omit',
    });

    if (response.status === 401) {
        // Token inválido/expirado: limpa storage e força re-login
        clearAuthStorage();
        window.location.reload();
        throw new Error("401 Unauthorized - token inválido, recarregando para login");
    }

    if (!response.ok) {
        const reason = await response.text().catch(() => "");
        const error: any = new Error(`REST request failed (${response.status}): ${reason}`);
        error.status = response.status;
        error.body = reason;
        error.url = endpoint;
        throw error;
    }
    return response.json();
};

// Catalog service instance (centralized catalog management)
const catalogService = new CatalogService();

const disableRestSession = (reason: string) => {
    useRestSessionLesson = false;
    restSessionDisabledReason = reason;
    console.warn(`[REST LESSON] ${reason}`);
};

const isLessonNotFoundError = (error: unknown): boolean => {
    const status = (error as any)?.status;
    const body = (error as any)?.body ?? (error instanceof Error ? error.message : "");
    return status === 404 && /lesson not found/i.test(String(body));
};

const buildSessionClientInfo = () => ({
    platform: "viewer",
    version: SESSION_CLIENT_VERSION,
    capabilities: {
        lesson_schema_versions: [1, 2],
    }
});

const buildSessionConfig = () => ({
    tempo_scale: 1.0,
    hit_window_ms: 120,
    mode: practiceMode === "FILM" ? "film" : "wait",
});

const generateSessionId = () => {
    try {
        return crypto?.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    } catch {
        return `sess_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    }
};

const toLessonContentPayload = (snapshot: any): LessonContentPacket => ({
    type: "lesson_content" as const,
    session_id: snapshot.session_id,
    lesson_id: snapshot.lesson_id,
    chapter_id: snapshot.chapter_id,
    lesson_version: snapshot.lesson_version,
    bpm: snapshot.bpm,
    beats_per_measure: snapshot.beats_per_measure,
    count_in_beats: snapshot.count_in_beats,
    total_steps: snapshot.total_steps,
    evaluation: {
        hit_window_ms: 300,
        late_miss_ms: 500,
        early_accept_ms: 150,
    },
    score: {
        xml_text: snapshot.score_xml,
    },
    notes: snapshot.notes ?? [],
    steps: snapshot.steps_json ?? snapshot.steps ?? undefined, // support both naming conventions from backend
    schema_version: snapshot.schema_version,
});

const midiToNote = (midi: number) => {
    const octave = Math.floor(midi / 12) - 1;
    const name = NOTE_NAMES[midi % 12] ?? "";
    return `${name}${octave}`;
};

const midiToName = (midi: number | null | undefined) => {
    if (midi === null || midi === undefined || !Number.isFinite(midi)) return "–";
    return `${midiToNote(midi)}(${midi})`;
};

const normalizeProgress = (value?: number | null) => {
    if (value == null) return 0;
    const raw = toNum(value);
    if (!isNumber(raw)) return 0;
    const pct = raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, pct));
};

const formatPercent = (value?: number | null) => {
    if (value == null) return null;
    const raw = toNum(value);
    if (!isNumber(raw)) return null;
    const pct = raw <= 1 ? raw * 100 : raw;
    return `${pct.toFixed(1)}%`;
};

const formatTimestamp = (value?: number | null) => {
    if (!value) return null;
    const ts = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
    });
};

// Fix for module scripts (deferred): check if DOM is already ready
const init = async () => {
    console.log('[DOM] 🎯 Initializing app...');
    console.log('[DOM] 📏 Body innerHTML length:', document.body.innerHTML.length);
    console.log('[DOM] 📄 Body preview:', document.body.innerHTML.substring(0, 200));

    // --- DOM Elements ---
    const osmdContainer = document.getElementById("osmd-container")!;
    const prCanvas = document.getElementById("piano-roll-canvas") as HTMLCanvasElement;
    const sheetSection = document.querySelector<HTMLElement>('.sheet-section')!;
    const pages: Record<string, HTMLElement | null> = {
        home: document.getElementById("home-page"),
        trainer: document.getElementById("trainer-page"),
        dashboard: document.getElementById("dashboard-page"),
        settings: document.getElementById("settings-page"),
    };
    const homeRoot = document.getElementById("home-root");
    const dashboardRoot = document.getElementById("dashboard-root");
    const settingsRoot = document.getElementById("settings-root");



    // UI Controls
    const midiStatusLabel = document.getElementById("midi-status");
    const midiToggleBtn = document.getElementById("midi-btn") as HTMLButtonElement | null;
    const midiPopover = document.getElementById("midi-popover");
    const midiPortSelect = document.getElementById("midi-port-select") as HTMLSelectElement | null;
    const midiRefreshBtn = document.getElementById("midi-refresh-btn") as HTMLButtonElement | null;
    const midiConnectBtn = document.getElementById("midi-connect-btn") as HTMLButtonElement | null;
    const midiDisconnectBtn = document.getElementById("midi-disconnect-btn") as HTMLButtonElement | null;
    const midiErrorEl = document.getElementById("midi-error");
    const midiPopoverStatus = document.getElementById("midi-popover-status");
    const practiceModeSelect = document.getElementById("practice-mode-select") as HTMLSelectElement | null;
    const bpmInput = document.getElementById("bpm-input") as HTMLInputElement | null;
    const metronomeToggle = document.getElementById("metronome-toggle") as HTMLInputElement | null;
    const transposeControl = document.getElementById("transpose-control") as HTMLElement | null;
    const transposeInput = document.getElementById("transpose-input") as HTMLInputElement | null;

    // Debug Controls
    const debugMouseToggle = document.getElementById("debug-mouse-toggle") as HTMLInputElement | null;
    const debugKeyboardToggle = document.getElementById("debug-keyboard-toggle") as HTMLInputElement | null;
    const debugBadge = document.getElementById("debug-badge");
    const debugSourceLabel = document.getElementById("debug-source-label");
    const debugNoteLabel = document.getElementById("debug-note-label");
    const flagSheetToggle = document.getElementById("flag-sheet-toggle") as HTMLInputElement | null;
    const flagFallingToggle = document.getElementById("flag-falling-toggle") as HTMLInputElement | null;

    // Chapter Overlay
    const chapterOverlay = document.getElementById("chapter-overlay");
    const chapterToggleBtn = document.getElementById("chapters-btn") as HTMLButtonElement | null;
    const chapterCloseBtn = document.getElementById("chapter-close-btn") as HTMLButtonElement | null;
    const chapterRefreshBtn = document.getElementById("chapter-refresh-btn") as HTMLButtonElement | null;
    const chapterSearchInput = document.getElementById("chapter-search-input") as HTMLInputElement | null;
    const chapterOverlayContent = document.getElementById("chapter-overlay-content");
    const chapterOverlayMeta = document.getElementById("chapter-overlay-meta");
    const chapterOverlayBackdrop = chapterOverlay?.querySelector<HTMLElement>("[data-overlay-close]");

    // Timing Debug
    const timingDebugItem = document.getElementById("timing-debug-item");
    const timingDebugValue = document.getElementById("timing-debug-value");

    // Transport Controls
    const playPauseBtn = document.getElementById("play-pause-btn") as HTMLButtonElement | null;
    const playIcon = document.getElementById("play-icon");
    const pauseIcon = document.getElementById("pause-icon");
    const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement | null;

    // Audio Toggle Button
    const audioPlayBtn = document.getElementById("audio-play-btn") as HTMLButtonElement | null;
    const audioOffIcon = document.getElementById("audio-off-icon");
    const audioOnIcon = document.getElementById("audio-on-icon");

    // BPM and Metronome controls
    const bpmControl = document.getElementById("bpm-control");
    const metronomeControl = document.getElementById("metronome-control");

    // --- Feature Flags ---
    await featureFlags.init(createRemoteFlagProvider());
    featureFlagSnapshot = featureFlags.snapshot();

    // --- Helper for UI State ---
    let lastTransportState = { playing: false, visible: false, mode: "" as string };

    const updateTransportControls = () => {
        if (!playPauseBtn || !playIcon || !pauseIcon) return;

        const isFilm = practiceMode === "FILM";
        const visible = isFilm && transportSupported;
        const playing = transportClient.isPlaying();

        // Optimization: only touch DOM if changed
        if (visible !== lastTransportState.visible || practiceMode !== lastTransportState.mode) {
            playPauseBtn.style.display = visible ? "" : "none";
            // BPM and Metronome only visible in FILM mode
            if (bpmControl) bpmControl.style.display = isFilm ? "" : "none";
            if (metronomeControl) metronomeControl.style.display = isFilm ? "" : "none";
            // Transpose always visible once a lesson is loaded
            if (transposeControl) transposeControl.style.display = transportSupported ? "" : "none";
            lastTransportState.visible = visible;
            lastTransportState.mode = practiceMode;
        }

        if (playing !== lastTransportState.playing) {
            playIcon.style.display = playing ? "none" : "";
            pauseIcon.style.display = playing ? "" : "none";
            lastTransportState.playing = playing;
        }
    };

    // Nav
    const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-btn"));
    const routeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-route]"));

    // Feature flag toggles (HUD)
    flagSheetToggle?.addEventListener("change", () => {
        featureFlags.set("showSheetMusic", !!flagSheetToggle.checked, "runtime");
    });
    flagFallingToggle?.addEventListener("change", () => {
        featureFlags.set("showFallingNotes", !!flagFallingToggle.checked, "runtime");
    });

    // --- Logic Instances ---
    const audioService = new AudioService();
    let osmdCtrl: OsmdController | null = null;
    let pianoRoll: PianoRollController | null = null;
    const ui = new UIService();
    // Instantiate lessonTimer
    lessonTimer = new LessonTimer((ms) => ui.updateTimer(ms));
    let engine: LessonEngineApi = createEngineV1();
    const orchestrator = new LessonOrchestrator();
    const transportClient = new LocalTransportDriver();
    const transportMetronome = new TransportMetronome();
    let filmEnded = false;
    let lastFilmSnapshot: TransportSnapshot | null = null;
    const FILM_HIT_WINDOW_MS = 50;
    const analyticsClient = new AnalyticsClient();
    const webMidiService = new WebMidiService();
    let wsTransport: ITransport;

    // --- State Variables ---
    let currentRoute = "home";
    let transportSupported = false; // Enabled after first load
    let sheetLessonId: string | null = null;
    let lessonNotes: any[] = [];
    let lessonSteps: LessonStepV2[] = [];
    let stepToCursorPos: number[] = [];
    let lastCursorIndex = -1;
    let activeChapterId: number | null = null;
    let lastLocalInput = { midi: -1, isOn: false, time: 0 }; // Dedupe state
    let sessionCtx: { id: string | null; lessonId: string | null; mode: LessonMode; seq: number } = {
        id: null,
        lessonId: null,
        mode: "WAIT",
        seq: 0,
    };
    let lastLessonContent: LessonContentPacket | null = null;
    let currentSchemaVersion: 1 | 2 = 1;
    let lastSyncLogMs = 0;
    let currentBeatsPerMeasure = 4;
    let pendingSheetXml: string | null = null;
    let currentSheetXml: string | null = null; // tracks last loaded XML for sheet restore
    let transpositionSemitones = 0;

    function attachNoteInputHandler() {
        if (!pianoRoll) return;
        pianoRoll.setNoteInputHandler((midi, velocity, source) => {
            if (source === "mouse" && !debugMouseEnabled) return;
            handleNoteInput(midi, velocity, source);
        });
    }

    // --- Feature Flag Controlled Mounts ---
    const ensureSheet = () => {
        if (!featureFlagSnapshot.showSheetMusic) return null;
        if (!osmdCtrl) {
            osmdCtrl = new OsmdController(osmdContainer);
            if (pendingSheetXml) {
                osmdCtrl.load(pendingSheetXml).catch((error) => console.warn('[OSMD] load pending XML failed', error));
                pendingSheetXml = null;
            }
        }
        return osmdCtrl;
    };

    const destroySheet = () => {
        if (!osmdCtrl) return;
        osmdCtrl.destroy();
        osmdCtrl = null;
    };

    const ensurePianoRoll = () => {
        if (!featureFlagSnapshot.showFallingNotes) return null;
        if (!pianoRoll) {
            pianoRoll = new PianoRollController(prCanvas, audioService);
            attachNoteInputHandler();
            syncDebugInputState();
            if (lessonNotes.length > 0) {
                pianoRoll.setNotes(lessonNotes, currentBeatsPerMeasure);
                pianoRoll.setPixelsPerBeat(FILM_PIXELS_PER_BEAT);
                const view = engine.getViewState?.();
                if (view) {
                    pianoRoll.updateProgress(view.scoreNoteIndex ?? view.currentStep ?? 0);
                }
            }
        }
        return pianoRoll;
    };

    const destroyPianoRoll = () => {
        if (!pianoRoll) return;
        pianoRoll.destroy();
        const ctx = prCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, prCanvas.width, prCanvas.height);
        pianoRoll = null;
    };

    const rebuildSheetMappings = async () => {
        if (!featureFlagSnapshot.showSheetMusic) return;
        const sheet = ensureSheet();
        if (!sheet) return;
        try {
            const xmlToLoad = pendingSheetXml ?? currentSheetXml;
            const didReload = !!xmlToLoad;
            if (xmlToLoad) {
                await sheet.load(xmlToLoad);
                currentSheetXml = xmlToLoad;
                pendingSheetXml = null;
            }
            if (currentSchemaVersion === 1 && lessonNotes.length) {
                stepToCursorPos = buildV1CursorMapping(sheet.osmd, lessonNotes);
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                const beatToXMap = buildBeatToXMappingV1(sheet, lessonNotes);
                sheet.setBeatToXMapping(beatToXMap, "v1");
            }
            if (currentSchemaVersion === 2 && lessonSteps.length) {
                stepToCursorPos = buildV2StepToCursorMapping(sheet.osmd, lessonSteps);
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                const beatToXMap = buildBeatToXMappingV2(sheet, lessonSteps, {
                    beatsPerMeasure: currentBeatsPerMeasure,
                    basePxPerBeat: FILM_PIXELS_PER_BEAT,
                    enableDynamic: V2_DYNAMIC_MEASURE_LAYOUT,
                });
                sheet.setBeatToXMapping(beatToXMap, "v2");
            }
            // Restore cursor visibility after a reload triggered by re-enabling the sheet
            if (didReload) {
                const cursor = sheet.osmd?.cursor;
                if (cursor) {
                    cursor.show();
                    const restoreIdx = lastCursorIndex >= 0 ? lastCursorIndex : 0;
                    sheet.jumpToPos(restoreIdx);
                }
            }
        } catch (error) {
            console.warn("[FeatureFlags] rebuild mappings failed", error);
        }
    };

    // --- Render Logic (Centralized) ---
    const renderView = (view: ViewState, snapshot: TransportSnapshot | null = null) => {
        // Shared done check
        if (view.status === 'DONE') {
            transportClient.stop();
            transportMetronome.stop();
            ui.updateHud({
                step: view.currentStep,
                total: view.totalSteps,
                status: "FINISHED"
            });
            const finalBatch = engine.flushAnalytics();
            if (finalBatch) wsTransport.send?.(finalBatch);
            return;
        }

        if (practiceMode === 'FILM' && snapshot) {
            const beatRaw = Number.isFinite((snapshot as any).transportBeat)
                ? snapshot.transportBeat
                : (Number.isFinite((snapshot as any).beatNow) ? (snapshot as any).beatNow : 0);
            const beatCursor = Math.max(0, beatRaw);
            const totalFilmSteps = currentSchemaVersion === 2 ? lessonSteps.length : lessonNotes.length;

            if (featureFlagSnapshot.showFallingNotes) {
                const pr = ensurePianoRoll();
                pr?.updateByBeat(beatRaw);
            }
            if (featureFlagSnapshot.showSheetMusic) {
                const sheet = ensureSheet();
                if (sheet) {
                    sheet.updateByBeat(beatCursor, { pixelsPerBeat: FILM_PIXELS_PER_BEAT });
                    const cursorSteps = currentSchemaVersion === 2 ? lessonSteps : lessonNotes;
                    sheet.moveCursorByBeat(beatCursor, cursorSteps);
                }
            }

            const filmStep = getFilmStepFromBeat(beatCursor);
            const nowHud = performance.now();
            const statusFlash = filmHudFlash && nowHud < filmHudFlash.untilMs ? filmHudFlash.status : null;
            const hudStatus = statusFlash ?? (snapshot.status === 'COUNTING' ? 'COUNTING' : 'PLAYING');

            updateTransportControls();

            ui.updateHud({
                step: filmStep,
                total: totalFilmSteps,
                status: hudStatus,
                scoreTotal: view.score,
                streak: view.streak,
                bestStreak: view.bestStreak,
            });

            const endBeat = getLessonEndBeat();
            if (!filmEnded && beatCursor >= endBeat + 1) {
                filmEnded = true;
                engine.forceEnd();
                transportClient.stop();
                transportMetronome.stop();
                ui.updateHud({ step: totalFilmSteps - 1, total: totalFilmSteps, status: "FINISHED" });
                const finalBatch = engine.flushAnalytics();
                if (finalBatch) wsTransport.send?.(finalBatch);
                return;
            }

            if (performance.now() - lastSyncLogMs > 500) {
                lastSyncLogMs = performance.now();
                console.log("[SYNC]", { beatRaw, beatCursor, bpm: snapshot.bpm, ppb: FILM_PIXELS_PER_BEAT, status: snapshot.status });
            }
        } else {
            // WAIT MODE
            const progressIndex = view.scoreNoteIndex ?? view.currentStep;

            if (featureFlagSnapshot.showFallingNotes) {
                const pr = ensurePianoRoll();
                pr?.updateProgress(progressIndex);
            }

            if (view.cursorIndex !== lastCursorIndex) {
                cursorController.setCursorIndex(view.cursorIndex);
                lastCursorIndex = view.cursorIndex;
            }

            // Sync HUD in WAIT mode too
            ui.updateHud({
                step: view.currentStep,
                total: view.totalSteps,
                status: view.status, // e.g. "WAITING"
                scoreTotal: view.score,
                streak: view.streak,
                bestStreak: view.bestStreak,
            });
        }
    };
    const isStalePayload = (payloadSessionId?: string | null, seqSnapshot?: number) => {
        if (payloadSessionId && sessionCtx.id && payloadSessionId !== sessionCtx.id) return true;
        if (seqSnapshot !== undefined && sessionCtx.seq !== seqSnapshot) return true;
        return false;
    };

    // Dashboard & Analytics
    let dashboardLoaded = false;
    let statsPromise: Promise<StatsViewModel> | null = null;
    let pendingAnalyticsRetry: number | null = null;
    let dashboardState: DashboardViewState = { status: "idle", stats: null };

    // MIDI State
    // MIDI State - now managed by WebMIDI service
    let midiState: MidiServiceState = webMidiService.getState();
    let midiPopoverOpen = false;

    // Chapter Catalog State
    interface ChapterCatalogItem {
        chapter_id: number;
        title: string;
        subtitle?: string | null;
        unlocked: boolean;
        locked_reason?: string | null;
        progress_pct?: number | null;
        recommended?: boolean;
        difficulty?: number | null;
        kpis?: { accuracy?: number | null; streak_best?: number | null; sessions_total?: number | null; latency_avg?: number | null };
        heatmap_summary?: { hard_notes?: number[] | null };
    }
    let chapterCatalog: ChapterCatalogItem[] = [];
    let chapterCatalogStatus: "idle" | "loading" | "ready" | "empty" | "error" = "idle";
    let chapterCatalogError: string | null = null;
    let pendingChapterCatalogRequest = false;
    let catalogRequestQueued = false;
    let chapterOverlayOpen = false;
    let chapterSearchTerm = "";
    let chapterCatalogTimeout: number | null = null;
    let pendingStartChapterId: number | null = null;
    let lastChapterCatalogRequestAt: number | null = null;
    let catalogFallbackAttempted = false;
    let chapterCatalogGeneratedAt: number | null = null;

    // Debug State
    let debugMouseEnabled = false;
    let debugKeyboardEnabled = false;
    let debugLastSource: DebugInputSource = "midi";
    let debugLastNote: string | null = null;
    const pressedKeyboardKeys = new Set<string>();
    let keyboardListenersAttached = false;

    // --- React Roots ---
    const homeReactRoot = homeRoot ? createRoot(homeRoot) : null;
    const dashboardReactRoot = dashboardRoot ? createRoot(dashboardRoot) : null;
    const settingsReactRoot = settingsRoot ? createRoot(settingsRoot) : null;

    // Navigation history for back button
    let previousRoute = "home";

    // Endscreen React Root (PR2)
    let endscreenReactRoot: Root | null = null;
    const getEndscreenRoot = (): Root => {
      if (!endscreenReactRoot) {
        // Create container if not exists
        let container = document.getElementById('endscreen-root');
        if (!container) {
          container = document.createElement('div');
          container.id = 'endscreen-root';
          document.body.appendChild(container);
        }
        endscreenReactRoot = createRoot(container);
      }
      return endscreenReactRoot;
    };

    // TrailNavigator React Root — mounts on demand over the trainer view
    let trailNavReactRoot: Root | null = null;
    const openTrailNavigator = () => {
        let container = document.getElementById('trail-nav-root');
        if (!container) {
            container = document.createElement('div');
            container.id = 'trail-nav-root';
            document.body.appendChild(container);
        }
        if (!trailNavReactRoot) trailNavReactRoot = createRoot(container);
        const close = () => {
            trailNavReactRoot?.render(null);
        };
        trailNavReactRoot.render(
            <TrailNavigator
                trails={catalogService.getTrails()}
                onSelectChapter={(chapterId, lessonId) => {
                    close();
                    // If a specific lessonId was selected (e.g. from upload chapter),
                    // override the default lesson mapping for this session
                    if (lessonId) {
                        startChapterWithLesson(chapterId, lessonId);
                    } else {
                        startChapter(chapterId);
                    }
                    setRoute('trainer');
                }}
                onClose={close}
            />
        );
    };

    // Endscreen State Management (PR2)
    let endscreenResult: import('./types/task').TaskResultSummary | null = null;
    let endscreenVisible = false;

    const hideEndscreen = () => {
      endscreenVisible = false;
      endscreenResult = null;
      renderEndscreen();
    };

    const showEndscreen = (result: import('./types/task').TaskResultSummary) => {
      endscreenResult = result;
      endscreenVisible = true;
      renderEndscreen();
    };

    const renderEndscreen = () => {
      const root = getEndscreenRoot();
      const nextChapterId = findNextLesson();
      
      root.render(
        <EndscreenContainer
          result={endscreenResult}
          isVisible={endscreenVisible}
          onClose={hideEndscreen}
          onBack={() => {
            hideEndscreen();
            setRoute('home');
          }}
          onRepeat={() => {
            hideEndscreen();
            // Reload current lesson with a fresh session ID
            if (lastLessonContent) {
              const freshPayload = { ...lastLessonContent, session_id: generateSessionId() };
              beginSession(freshPayload, { targetMode: practiceMode, reason: 'repeat' });
            }
          }}
          onNext={nextChapterId ? () => {
            hideEndscreen();
            startChapter(nextChapterId);
          } : undefined}
          hasNext={!!nextChapterId}
        />
      );
    };

    // Configure engine end callback (PR2/PR3)
    const setupEngineEndCallback = () => {
        engine.setOnEnded(() => {
            // 🔒 Atomic shutdown — stop timer + frameLoop immediately (idempotent)
            sessionController?.endLesson("COMPLETE");
            console.log('[Endscreen] Lesson ended, computing result...');
            // 🔒 Stop transport loop + metronome immediately (kills [ENGINE_FRAME] in WAIT mode)
            transportClient.stop();
            transportMetronome.stop();
            const attempts = engine.getAttemptLog();
            const meta = engine.getLessonMeta();

            if (attempts.length === 0) {
                console.log('[Endscreen] No attempts logged, skipping endscreen');
                return;
            }

            // Use schema version (not practice mode) to identify V1/V2 engine correctly
            // V2 engine is used for polyphonic chapters in WAIT mode too
            const version = currentSchemaVersion === 2 ? 'V2' : 'V1';

            console.log(`[Endscreen] Mode: ${practiceMode}, Using version: ${version}`);

            const result = computeTaskResult(
                attempts,
                meta.totalSteps,
                practiceMode === 'FILM' ? 'FILM' : 'WAIT',
                meta.lessonId ?? undefined,
                meta.chapterId ?? undefined,
                version // PR3: V2 for FILM, V1 for WAIT
            );

            console.log('[Endscreen] Dispatching result:', result);
            dispatchTaskCompletion(result);

            // ── Fire-and-forget POST /v1/sessions/{id}/complete ──
            // Endscreen is shown IMMEDIATELY below — this POST never blocks UI.
            const completeSessionId = sessionCtx.id;
            if (!completeSessionId) {
                console.warn('[Complete] skipped: missing session id');
            } else {
                console.log('[Complete] preparing payload', { session_id: completeSessionId });
                const responseTimes = attempts
                    .filter((a: any) => a.responseMs !== undefined)
                    .map((a: any) => a.responseMs as number);
                const avgLatency = responseTimes.length > 0
                    ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
                    : 0;
                const stdLatency = responseTimes.length > 1
                    ? Math.round(Math.sqrt(responseTimes.reduce((sum: number, v: number) => sum + (v - avgLatency) ** 2, 0) / responseTimes.length))
                    : 0;
                const hits = attempts.filter((a: any) => a.success).length;
                const misses = attempts.length - hits;
                const pitchAccuracy = attempts.length > 0 ? +(hits / attempts.length).toFixed(4) : 0;
                // timing_accuracy: ratio of responses within 200ms window
                const timingHits = responseTimes.filter((ms: number) => ms <= 200).length;
                const timingAccuracy = responseTimes.length > 0 ? +(timingHits / responseTimes.length).toFixed(4) : 0;

                const completePayload = {
                    completed_at: new Date().toISOString(),
                    duration_ms: result.duration ?? 0,
                    summary: {
                        pitch_accuracy: pitchAccuracy,
                        timing_accuracy: timingAccuracy,
                        avg_latency_ms: avgLatency,
                        std_latency_ms: stdLatency,
                        hits,
                        misses,
                    },
                    attempts_compact: attempts.map((a: any) => [
                        a.stepIndex ?? 0,
                        a.success ? 1 : 0,
                        a.responseMs ?? 0,
                    ]),
                };

                const token = getAuthTokenFromStorage();
                if (!token) {
                    console.warn('[Complete] skipped: no auth token available');
                } else {
                    const idempotencyKey = typeof crypto?.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `idem_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
                    const apiBase = getConfig().apiBaseUrl || '';
                    const completeUrl = `${apiBase}/v1/sessions/${completeSessionId}/complete`;

                    console.log('[Complete] POST sent', { url: completeUrl, idempotencyKey });

                    fetch(completeUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'Idempotency-Key': idempotencyKey,
                        },
                        body: JSON.stringify(completePayload),
                    })
                    .then((resp) => {
                        if (resp.ok) {
                            console.log('[Complete] success', { status: resp.status });
                        } else {
                            console.warn('[Complete] failed', { status: resp.status });
                        }
                    })
                    .catch((err) => {
                        console.warn('[Complete] failed (network)', err?.message ?? err);
                    });
                }
            }

            showEndscreen(result);
        });
    };

    // PR3: Find next lesson in catalog
    const findNextLesson = (): number | null => {
      if (activeChapterId === null || chapterCatalog.length === 0) return null;
      
      // Find current index in catalog
      const currentIndex = chapterCatalog.findIndex(c => c.chapter_id === activeChapterId);
      if (currentIndex === -1) return null;
      
      // Find next unlocked chapter
      for (let i = currentIndex + 1; i < chapterCatalog.length; i++) {
        if (chapterCatalog[i].unlocked) {
          return chapterCatalog[i].chapter_id;
        }
      }
      return null;
    };

    const requestMidiAccess = async () => {
        try {
            await webMidiService.requestAccess();
        } catch (error) {
            console.error('[MIDI] Failed to request access:', error);
        }
    };

    const updateMidiUI = () => {
        // Update status label
        if (midiStatusLabel) {
            if (midiState.connected && midiState.activePort) {
                midiStatusLabel.textContent = `MIDI: ${midiState.activePort}`;
                midiStatusLabel.classList.add('connected');
            } else {
                midiStatusLabel.textContent = 'MIDI: Desconectado';
                midiStatusLabel.classList.remove('connected');
            }
        }

        // Update popover

        // Update icon visual state
        if (midiToggleBtn) {
            midiToggleBtn.classList.remove('midi-disconnected', 'midi-connected', 'midi-error');

            if (midiState.error) {
                midiToggleBtn.classList.add('midi-error');
            } else if (midiState.connected) {
                midiToggleBtn.classList.add('midi-connected');
            } else {
                midiToggleBtn.classList.add('midi-disconnected');
            }
        }

        updateMidiPopover();
    };

    const updateMidiPopover = () => {
        console.log('[MIDI] updateMidiPopover called, midiPopoverOpen:', midiPopoverOpen);
        if (!midiPopover) return;

        midiPopover.classList.toggle('active', midiPopoverOpen);
        midiPopover.hidden = !midiPopoverOpen;
        console.log('[MIDI] Set midiPopover.hidden to:', !midiPopoverOpen);

        // Populate port select
        if (midiPortSelect) {
            midiPortSelect.innerHTML = '';

            if (midiState.ports.length === 0) {
                const opt = document.createElement('option');
                opt.textContent = 'Nenhum dispositivo detectado';
                opt.disabled = true;
                midiPortSelect.appendChild(opt);
            } else {
                midiState.ports.forEach(port => {
                    const opt = document.createElement('option');
                    opt.value = port.id;
                    opt.textContent = port.name;
                    if (port.id === midiState.selectedPort) {
                        opt.selected = true;
                    }
                    midiPortSelect.appendChild(opt);
                });
            }
        }

        // Update status text
        if (midiPopoverStatus) {
            if (!midiState.supported) {
                midiPopoverStatus.textContent = 'Web MIDI não suportado neste navegador';
            } else if (midiState.error) {
                midiPopoverStatus.textContent = `Erro: ${midiState.error}`;
            } else if (midiState.connected) {
                midiPopoverStatus.textContent = `Conectado: ${midiState.activePort}`;
            } else if (midiState.accessGranted) {
                midiPopoverStatus.textContent = 'Aguardando conexão...';
            } else {
                midiPopoverStatus.textContent = 'Clique em Atualizar para solicitar acesso';
            }
        }

        // Update error display
        if (midiErrorEl) {
            if (midiState.error) {
                midiErrorEl.textContent = midiState.error;
                midiErrorEl.style.display = '';
            } else {
                midiErrorEl.style.display = 'none';
            }
        }

        // Enable/disable buttons
        if (midiConnectBtn) {
            midiConnectBtn.disabled = !midiState.accessGranted || midiState.connected || midiState.ports.length === 0;
        }
        if (midiDisconnectBtn) {
            midiDisconnectBtn.disabled = !midiState.connected;
        }

        // Update MIDI button visual state (active = connected)
        if (midiToggleBtn) {
            midiToggleBtn.classList.toggle("active", midiState.connected);
            midiToggleBtn.title = midiState.connected
                ? `MIDI: ${midiState.activePort || 'Conectado'}`
                : "Gerenciar MIDI";
        }
    };

    // ===== WebMIDI Integration =====
    // Setup WebMIDI service event handlers
    webMidiService.onStateChange((newState) => {
        midiState = newState;
        updateMidiUI();
        emitConnectionStatus({
            isConnected: newState.connected,
            deviceName: newState.activePort || 'Nenhum dispositivo'
        });
    });

    webMidiService.onNoteEvent((event) => {
        handleMidiNoteEvent(event);
    });

    const handleMidiNoteEvent = (event: MidiNoteEvent) => {
        if (!isTrainerActive()) return;

        // Delegate to centralized input handler
        // This ensures FILM mode (and others) are handled consistently for both Keyboard and MIDI
        // Note: event.velocity is 0 for note_off equivalent
        const velocity = event.type === 'note_off' ? 0 : event.velocity;
        handleNoteInput(event.midi, velocity, 'midi');
    };





    // --- Helper Functions ---

    const isTrainerActive = () => currentRoute === "trainer";

    const isTextInputTarget = (target: EventTarget | null): target is HTMLElement => {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName.toLowerCase();
        return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const ensureDashboard = async () => {
        if (!dashboardRoot) return;
        if (!dashboardLoaded) {
            bootstrapDashboardFromCache();
            dashboardLoaded = true;
        }
        renderDashboardView(
            dashboardState.stats ? (dashboardState.status === "idle" ? "stale" : dashboardState.status) : "loading"
        );

        try {
            await fetchStats();
        } catch (error) {
            console.warn("[Dashboard] Falha ao atualizar analytics", error);
        }
    };

    const ensureSettings = () => {
        if (!settingsReactRoot) return;
        settingsReactRoot.render(
            <SettingsPage onBack={() => setRoute(previousRoute)} />
        );
    };

    const setRoute = (route: string) => {
        if (route !== currentRoute) previousRoute = currentRoute;
        currentRoute = route;
        Object.entries(pages).forEach(([key, element]) => {
            element?.classList.toggle("active", key === route);
        });
        navButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.route === route);
        });
        if (route === "dashboard") {
            ensureDashboard();
        }
        if (route === "settings") {
            ensureSettings();
        }

        // Disable debug inputs when leaving trainer
        if (!isTrainerActive()) {
            debugMouseEnabled = false;
            debugKeyboardEnabled = false;
            if (debugMouseToggle) debugMouseToggle.checked = false;
            if (debugKeyboardToggle) debugKeyboardToggle.checked = false;
        }
        syncDebugInputState();
    };

    const cursorController = (() => {
        const getCursor = () => osmdCtrl?.osmd?.cursor;
        const resetState = () => { lastCursorIndex = -1; };
        const initCursor = () => {
            if (!featureFlagSnapshot.showSheetMusic) return;
            const sheet = ensureSheet();
            const c = getCursor();
            if (c && sheet) {
                c.show();
                sheet.jumpToPos(0);
            }
        };
        const setCursorIndex = (idx: number, opts?: { snapCamera?: boolean; resetSpring?: boolean }) => {
            if (!featureFlagSnapshot.showSheetMusic) return;
            const sheet = ensureSheet();
            if (!sheet) return;
            // Use snapCamera: false to allow smooth scrolling from updateByBeat in FILM mode
            // But here we set resetSpring to false to avoid jitter
            sheet.jumpToPos(idx, { snapCamera: opts?.snapCamera ?? false, resetSpring: opts?.resetSpring ?? false });
        };
        return { initCursor, resetState, setCursorIndex };
    })();

    const resolvePracticeMode = (val: string): LessonMode => {
        return (val === 'TIME_FILM' || val === 'FILM') ? 'FILM' : 'WAIT';
    };

    const switchPracticeMode = (mode: LessonMode, reason?: string, opts?: { restartSession?: boolean }) => {
        const target = resolvePracticeMode(mode);
        if (opts?.restartSession && target !== practiceMode && lastLessonContent) {
            const freshPayload = { ...lastLessonContent, session_id: generateSessionId() };
            beginSession(freshPayload, { targetMode: target, reason: reason ?? "mode_change" });
            return;
        }
        applyPracticeMode(target, reason);
    };

    // --- Data Helpers ---
    const getNoteStartBeat = (n: any) => {
        const a = toNum(n?.start_beat);
        if (isNumber(a)) return a;
        const b = toNum(n?.startBeat);
        if (isNumber(b)) return b;
        return 0;
    };

    const getNoteEndBeat = (n: any) => {
        const endA = toNum(n?.end_beat);
        if (isNumber(endA)) return endA;
        const endB = toNum(n?.endBeat);
        if (isNumber(endB)) return endB;

        const start = getNoteStartBeat(n);
        const durA = toNum(n?.duration_beats);
        const durB = toNum(n?.durationBeats);
        // Fallback duration 1 beat if missing
        const dur = isNumber(durA) ? durA : (isNumber(durB) ? durB : 1);

        return start + Math.max(0.1, dur);
    };

    const getLessonEndBeat = () => {
        if (currentSchemaVersion === 2 && lessonSteps.length > 0) {
            return getNoteEndBeat(lessonSteps[lessonSteps.length - 1]);
        }
        if (!lessonNotes || lessonNotes.length === 0) return 0;
        return getNoteEndBeat(lessonNotes[lessonNotes.length - 1]);
    };

    // Helper for FILM mode cursor logic
    const getFilmStepFromBeat = (beat: number) => {
        if (currentSchemaVersion === 2 && lessonSteps.length > 0) {
            let low = 0;
            let high = lessonSteps.length - 1;
            let ans = 0;
            while (low <= high) {
                const mid = (low + high) >> 1;
                const stepBeat = Number(lessonSteps[mid]?.start_beat ?? 0);
                if (stepBeat <= beat) {
                    ans = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return ans;
        }
        if (!lessonNotes || lessonNotes.length === 0) return 0;

        let low = 0;
        let high = lessonNotes.length - 1;
        let ans = 0;

        while (low <= high) {
            const mid = (low + high) >> 1;
            const noteBeat = getNoteStartBeat(lessonNotes[mid]);

            if (noteBeat <= beat) {
                ans = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return ans;
    };

    const resetSessionState = (reason: string, totalSteps?: number | null) => {
        console.info("[Session] RESET", { reason, session: sessionCtx.id, lesson: sessionCtx.lessonId });
        transportClient.stop();
        transportMetronome.stop();
        cursorController.resetState();
        osmdCtrl?.reset().catch(() => { });
        if (pianoRoll) {
            pianoRoll.setNotes([], 4);
            pianoRoll.updateProgress(0);
        }
        lessonNotes = [];
        lessonSteps = [];
        stepToCursorPos = [];
        lastCursorIndex = -1;
        transportSupported = false;
        sheetLessonId = null;
        currentSchemaVersion = 1;
        engine.forceEnd();
        filmEnded = false;
        filmHudFlash = null;
        ui.updateHud({ step: 0, total: totalSteps ?? null, status: "RESET", scoreTotal: 0, streak: 0, bestStreak: 0 });
    };

    const normalizeLessonPayload = (payload: LessonContentPacket): LessonContentPacket => {
        const sessionId = payload.session_id && String(payload.session_id).trim().length > 0 ? payload.session_id : generateSessionId();
        return { ...payload, session_id: sessionId };
    };

    const applyPracticeMode = (mode: LessonMode, reason?: string) => {
        if (mode === "FILM" && !transportSupported) {
            console.warn(`[Mode] TIME_FILM indisponível${reason ? ` (${reason})` : ""}`);
            mode = "WAIT";
        }

        practiceMode = mode;
        sessionCtx.mode = mode;
        engine.setMode(mode);
        transportClient.setMode(mode);
        filmHudFlash = null;

        if (mode === "FILM") {
            transportClient.setConfig({
                bpm: Number(bpmInput?.value) || 120,
                beatsPerMeasure: 4,
                countInBeats: lessonNotes?.length ? ((lastLessonContent as any)?.count_in_beats ?? 4) : 4,
            });
            transportClient.start();
            if (featureFlagSnapshot.showSheetMusic) {
                ensureSheet()?.setFilmMode(true, { pixelsPerBeat: FILM_PIXELS_PER_BEAT });
            }
            if (metronomeToggle) transportMetronome.setEnabled(metronomeToggle.checked);
            if (timingDebugItem) timingDebugItem.style.display = "block"; // Show debug
        } else {
            if (featureFlagSnapshot.showSheetMusic) {
                osmdCtrl?.setFilmMode(false);
            }
            transportClient.stop();
            transportMetronome.stop();
            if (timingDebugItem) timingDebugItem.style.display = "none"; // Hide debug
            const view = engine.getViewState();
            cursorController.setCursorIndex(view.cursorIndex, { snapCamera: false, resetSpring: false });
            lastCursorIndex = view.cursorIndex;
        }

        if (practiceModeSelect) {
            const opts = Array.from(practiceModeSelect.options);
            const match = opts.find((o) => resolvePracticeMode(o.value) === mode);
            if (match) practiceModeSelect.value = match.value;
        }
        updateTransportControls();
    };

    const beginSession = (payload: LessonContentPacket, opts?: { targetMode?: LessonMode; reason?: string }) => {

        const normalized = normalizeLessonPayload(payload);

        const targetMode = opts?.targetMode ?? "WAIT";
        const nextSeq = sessionCtx.seq + 1;

        if (sessionCtx.id) {
            pushEvent("session_end", { session_id: sessionCtx.id, lesson_id: sessionCtx.lessonId, reason: opts?.reason });
        }

        sessionCtx = {
            id: normalized.session_id,
            lessonId: normalized.lesson_id,
            mode: targetMode,
            seq: nextSeq,
        };
        filmEnded = false;
        lastLessonContent = normalized;
        const totalForHud =
            normalized.total_steps ??
            (normalized.steps ? normalized.steps.length : (normalized.notes ? normalized.notes.length : null));
        resetSessionState(opts?.reason ?? "session_start", totalForHud);
        resetEventStream(sessionCtx.id, sessionCtx.lessonId, targetMode, totalForHud);

        const seqGuard = sessionCtx.seq;

        const baseCallbacks = {
            onReset: async (token: string) => {
                if (isStalePayload(normalized.session_id, seqGuard)) return;
                if (!orchestrator.isValidToken(token)) return;
                cursorController.resetState();
                if (featureFlagSnapshot.showSheetMusic && osmdCtrl) {
                    await osmdCtrl.reset();
                }
                transportClient.stop();
                transportMetronome.stop();
            },
            onLoadXML: async (token: string, xml: string) => {
                if (isStalePayload(normalized.session_id, seqGuard)) return;
                if (!orchestrator.isValidToken(token)) return;
                currentSheetXml = xml; // always persist for sheet restore
                if (!featureFlagSnapshot.showSheetMusic) {
                    pendingSheetXml = xml;
                    return;
                }
                const sheet = ensureSheet();
                if (sheet) {
                    await sheet.load(xml);
                    if (transpositionSemitones !== 0) await sheet.setTransposition(transpositionSemitones);
                    cursorController.initCursor();
                    pendingSheetXml = null;
                }
            },
            onCommitSheet: async (token: string, lessonId: string) => {
                if (isStalePayload(normalized.session_id, seqGuard)) return;
                if (!orchestrator.isValidToken(token)) return;
                sheetLessonId = lessonId;
            },
        };

        const { lesson: transposedLesson } = LessonTransposer.transpose(normalized, { semitones: transpositionSemitones });

        parseAndRoute(transposedLesson, {
            pipelineV1: (packet) => {
                currentSchemaVersion = 1;
                lessonSteps = [];
                engine = createEngineV1();
                engine.setTimer(lessonTimer); // 🔒 wire timer so forceEnd() stops the HUD interval
                sessionController = new LessonSessionController({ timer: lessonTimer, frameLoop: transportClient, engine });
                setupEngineEndCallback(); // PR2: Setup endscreen callback

                const basePayload: LessonContentPacket = {
                    ...normalized,
                    schema_version: 1,
                    session_id: packet.session_id,
                    lesson_id: packet.lesson_id,
                    lesson_version: packet.lesson_version,
                    bpm: packet.bpm,
                    beats_per_measure: packet.beats_per_measure,
                    count_in_beats: packet.count_in_beats,
                    total_steps: packet.total_steps,
                    notes: packet.content.notes,
                    steps: undefined,
                };

                orchestrator.loadFromContent(basePayload, {
                    ...baseCallbacks,
                    onCommitPianoRoll: async (token, content, lessonId) => {
                        if (isStalePayload(normalized.session_id, seqGuard)) return;
                        if (!orchestrator.isValidToken(token)) return;
                        if (sheetLessonId !== lessonId) return;

                        currentBeatsPerMeasure = basePayload.beats_per_measure ?? 4;
                        const rawNotes = basePayload.notes ?? [];
                        lessonNotes = rawNotes.map((n: any) => ({ ...n, targetBeat: n.start_beat }));

                        console.log('[BEATS_SAMPLE]', {
                            notes: lessonNotes.slice(0, 12).map((n: any, i: number) => ({
                                step: i,
                                midi: n.midi,
                                start_beat: n.start_beat,
                                delta_from_prev: i > 0 ? (n.start_beat - lessonNotes[i - 1].start_beat).toFixed(2) : 'N/A'
                            }))
                        });

                        const beatDeltas: number[] = [];
                        for (let i = 1; i < Math.min(20, lessonNotes.length); i++) {
                            const delta = lessonNotes[i].start_beat - lessonNotes[i - 1].start_beat;
                            if (delta > 0) beatDeltas.push(delta);
                        }
                        const uniqueDeltas = [...new Set(beatDeltas.map(d => d.toFixed(2)))];
                        const hasEighth = uniqueDeltas.some(d => Math.abs(parseFloat(d) - 0.5) < 0.05);
                        const hasQuarter = uniqueDeltas.some(d => Math.abs(parseFloat(d) - 1.0) < 0.05);
                        const hasHalf = uniqueDeltas.some(d => Math.abs(parseFloat(d) - 2.0) < 0.05);

                        console.log('[BEAT_PATTERN]', {
                            unique_deltas: uniqueDeltas,
                            likely_unit: hasEighth && !hasQuarter ? '⚠️ EIGHTH (need /2)' :
                                hasHalf && !hasQuarter ? '⚠️ HALF (need *2)' :
                                    hasQuarter ? '✅ QUARTER (canonical)' : '❓ UNKNOWN',
                            recommendation: hasEighth && !hasQuarter ? 'Apply quarterBeat = rawBeat / 2' :
                                hasHalf && !hasQuarter ? 'Apply quarterBeat = rawBeat * 2' :
                                    'No conversion needed'
                        });

                        if (featureFlagSnapshot.showSheetMusic) {
                            const sheet = ensureSheet();
                            if (sheet) {
                                stepToCursorPos = buildV1CursorMapping(sheet.osmd, rawNotes);
                                // Aguardar 2 frames para garantir que OSMD renderizou completamente
                                await new Promise(requestAnimationFrame);
                                await new Promise(requestAnimationFrame);
                                const beatToXMap = buildBeatToXMappingV1(sheet, lessonNotes);
                                sheet.setBeatToXMapping(beatToXMap, "v1");
                            }
                        }

                        if (featureFlagSnapshot.showFallingNotes) {
                            const pr = ensurePianoRoll();
                            pr?.setNotes(lessonNotes, basePayload.beats_per_measure);
                            pr?.setPixelsPerBeat(FILM_PIXELS_PER_BEAT);
                        }

                        transportClient.setConfig({
                            bpm: basePayload.bpm,
                            beatsPerMeasure: basePayload.beats_per_measure,
                            countInBeats: basePayload.count_in_beats,
                        });
                        transportSupported = true;

                        if (practiceModeSelect) {
                            const opt =
                                practiceModeSelect.querySelector('option[value="FILM"]') ||
                                practiceModeSelect.querySelector('option[value="TIME_FILM"]');
                            if (opt) (opt as HTMLOptionElement).disabled = false;
                        }

                        engine.loadLesson({
                            session_id: packet.session_id,
                            lesson_id: packet.lesson_id,
                            lesson_version: packet.lesson_version,
                            total_steps: packet.total_steps,
                            notes: rawNotes,
                            step_to_cursor_pos: stepToCursorPos,
                        });
                        applyPracticeMode(targetMode);
                        if (bpmInput) bpmInput.value = String(basePayload.bpm);

                        console.log("Lesson fully loaded.");
                    },
                });
            },
            pipelineV2: (packet) => {
                currentSchemaVersion = 2;
                const orderedSteps = (packet.content.steps ?? []).map((step, idx) => ({ step, idx }))
                    .sort((a, b) => {
                        const aKey = Number.isFinite(a.step.step_index) ? Number(a.step.step_index) : a.idx;
                        const bKey = Number.isFinite(b.step.step_index) ? Number(b.step.step_index) : b.idx;
                        return aKey - bKey;
                    })
                    .map(({ step }) => step);
                lessonSteps = orderedSteps;
                engine = createEngineV2();
                engine.setTimer(lessonTimer); // 🔒 wire timer so forceEnd() stops the HUD interval
                sessionController = new LessonSessionController({ timer: lessonTimer, frameLoop: transportClient, engine });
                setupEngineEndCallback(); // PR2: Setup endscreen callback

                const { renderNotes, startIndexByStep } = deriveRenderNotesFromV2Steps(orderedSteps);
                const orchestratorPayload: LessonContentPacket = {
                    ...normalized,
                    schema_version: 2,
                    session_id: packet.session_id,
                    lesson_id: packet.lesson_id,
                    lesson_version: packet.lesson_version,
                    bpm: packet.bpm,
                    beats_per_measure: packet.beats_per_measure,
                    count_in_beats: packet.count_in_beats,
                    total_steps: packet.total_steps,
                    steps: orderedSteps,
                    notes: renderNotes,
                };

                orchestrator.loadFromContent(orchestratorPayload, {
                    ...baseCallbacks,
                    onCommitPianoRoll: async (token, content, lessonId) => {
                        if (isStalePayload(normalized.session_id, seqGuard)) return;
                        if (!orchestrator.isValidToken(token)) return;
                        if (sheetLessonId !== lessonId) return;

                        currentBeatsPerMeasure = packet.beats_per_measure ?? 4;
                        lessonNotes = renderNotes.map((n) => ({ ...n, targetBeat: n.start_beat }));

                        if (featureFlagSnapshot.showSheetMusic) {
                            const sheet = ensureSheet();
                            if (sheet) {
                                stepToCursorPos = buildV2StepToCursorMapping(sheet.osmd, lessonSteps);

                                // Aguardar 2 frames para garantir que OSMD renderizou completamente
                                await new Promise(requestAnimationFrame);
                                await new Promise(requestAnimationFrame);

                                const beatToXMap = buildBeatToXMappingV2(sheet, lessonSteps, {
                                    beatsPerMeasure: packet.beats_per_measure,
                                    basePxPerBeat: FILM_PIXELS_PER_BEAT,
                                    enableDynamic: V2_DYNAMIC_MEASURE_LAYOUT,
                                });
                                sheet.setBeatToXMapping(beatToXMap, "v2");
                            }
                        }

                        if (featureFlagSnapshot.showFallingNotes) {
                            const pr = ensurePianoRoll();
                            pr?.setNotes(lessonNotes, packet.beats_per_measure);
                            pr?.setPixelsPerBeat(FILM_PIXELS_PER_BEAT);
                        }

                        transportClient.setConfig({
                            bpm: packet.bpm,
                            beatsPerMeasure: packet.beats_per_measure,
                            countInBeats: packet.count_in_beats,
                        });
                        transportSupported = true;

                        if (practiceModeSelect) {
                            const opt =
                                practiceModeSelect.querySelector('option[value="FILM"]') ||
                                practiceModeSelect.querySelector('option[value="TIME_FILM"]');
                            if (opt) (opt as HTMLOptionElement).disabled = false;
                        }

                        engine.loadLesson({
                            session_id: packet.session_id,
                            lesson_id: packet.lesson_id,
                            lesson_version: packet.lesson_version,
                            total_steps: packet.total_steps,
                            steps: orderedSteps,
                            step_to_cursor_pos: stepToCursorPos,
                            renderNoteStartIndexByStep: startIndexByStep,
                        });
                        applyPracticeMode(targetMode);
                        if (bpmInput) bpmInput.value = String(packet.bpm);

                        console.log("Lesson fully loaded.");
                    },
                });
            },
        });
    };

    // --- WebSocket Transport moved to transport/ws-transport.ts ---

    // --- Debug & Input Handling ---

    const updateDebugHud = (source?: DebugInputSource, midi?: number | null) => {
        if (source) debugLastSource = source;
        if (midi !== undefined && midi !== null && Number.isFinite(midi)) {
            debugLastNote = midiToNote(Math.round(midi));
        }

        if (debugBadge) debugBadge.hidden = !(debugMouseEnabled || debugKeyboardEnabled);
        if (debugSourceLabel) debugSourceLabel.textContent = `Input: ${debugLastSource.toUpperCase()}`;
        if (debugNoteLabel) debugNoteLabel.textContent = debugLastNote ?? "--";
    };

    const handleNoteInput = (midi: number, velocity: number, source: DebugInputSource) => {
        if (!Number.isFinite(midi)) return;

        // 🔒 Guard: lesson is over — do not process or log any input
        if (sessionController?.isEnded() || engine.getViewState().status === 'DONE') return;

        // Only accept debug inputs in trainer
        if (!isTrainerActive() && velocity > 0) return;

        const midiInt = Math.max(0, Math.min(127, Math.round(midi)));
        const velInt = Math.max(0, Math.min(127, Math.round(velocity)));
        const isOn = velInt > 0;

        console.debug("[NOTE_INPUT]", {
            source,
            mode: practiceMode,
            session_id: sessionCtx.id,
            midi: midiInt,
            name: midiToName(midiInt),
            isOn,
            trainerActive: isTrainerActive()
        });

        // 1. Mark for deduplication (prevent echo double-processing)
        const now = performance.now();
        if (
            lastLocalInput.midi === midiInt &&
            lastLocalInput.isOn === isOn &&
            (now - lastLocalInput.time) < 50
        ) {
            return;
        }
        lastLocalInput = { midi: midiInt, isOn, time: now };

        // 2. Visual Feedback
        if (featureFlagSnapshot.showFallingNotes) {
            const pr = ensurePianoRoll();
            pr?.setActiveNote(midiInt, isOn);
        }

        // 3. Engine Logic (Client-side)
        const viewBefore = engine.getViewState();

        let res: { result?: "HIT" | "MISS" | "LATE" | "NONE"; score?: number; streak?: number } | null = null;
        let judge: {
            result?: "HIT" | "MISS" | "LATE" | "NONE";
            expected?: number;
            deltaMs?: number;
            step?: number;
            completedStep?: boolean;
            accuracy?: "PERFECT" | "GOOD" | "OK" | "LATE";
            progress?: string;
        } | null = null;
        let viewAfter = viewBefore;

        if (practiceMode === "WAIT") {
            const expectedMidi = engine.getExpectedMidi(viewBefore.currentStep);
            console.debug("[WAIT]", {
                session_id: sessionCtx.id,
                step: viewBefore.currentStep,
                total: viewBefore.totalSteps,
                expected: expectedMidi,
                expectedName: midiToName(expectedMidi),
                got: midiInt,
                gotName: midiToName(midiInt)
            });
            res = engine.onMidiInput(midiInt, velInt, isOn);
            // 🔒 One-call, no race: detect DONE synchronously before pushEvent/wsTransport
            viewAfter = engine.getViewState();
            if (viewAfter.status === 'DONE') {
                sessionController?.endLesson("COMPLETE"); // synchronous — isEnded = true immediately
                renderView(viewAfter); // render DONE before Endscreen
                return; // cancel pushEvent, wsTransport.send and subsequent logs
            }
            // Force render update immediately (includes cursor update)
            renderView(viewAfter);
        } else if (practiceMode === "FILM" && lastFilmSnapshot) {
            judge = engine.judgeFilmNoteOn(midiInt, velInt, lastFilmSnapshot.transportBeat, lastFilmSnapshot.bpm, FILM_HIT_WINDOW_MS);
            viewAfter = engine.getViewState();

            // Only flash visual feedback when a step is completed
            if (judge?.completedStep && judge.result !== "NONE") {
                flashFilmStatus(judge.accuracy || judge.result);
            }

            console.debug("[FILM_JUDGE]", {
                session_id: sessionCtx.id,
                beatNow: lastFilmSnapshot.transportBeat,
                bpm: lastFilmSnapshot.bpm,
                expected: judge?.expected,
                deltaMs: judge?.deltaMs,
                result: judge?.result ?? "NONE",
                accuracy: judge?.accuracy,
                completedStep: judge?.completedStep,
                progress: judge?.progress,
                score: viewAfter.score,
                streak: viewAfter.streak,
                bestStreak: viewAfter.bestStreak,
            });
            // Note: renderView is NOT called here - transport tick handles rendering
        } else {
            // other modes (fallback)
            res = engine.onMidiInput(midiInt, velInt, isOn);
            viewAfter = engine.getViewState();
        }

        // Event stream
        pushEvent("note_on", { session_id: sessionCtx.id, lesson_id: sessionCtx.lessonId, midi: midiInt, source });
        const noteResultPayload =
            practiceMode === "FILM"
                ? (judge?.result && judge.result !== "NONE"
                    ? {
                        result: judge.result,
                        step: judge.step ?? viewBefore.currentStep,
                        expected: judge.expected,
                        played: midiInt,
                        streak: viewAfter.streak,
                        score: viewAfter.score,
                    }
                    : null)
                : (res?.result && res.result !== "NONE"
                    ? {
                        result: res.result,
                        step: viewBefore.currentStep,
                        expected: engine.getExpectedMidi(viewBefore.currentStep),
                        played: midiInt,
                        streak: res.streak ?? viewAfter.streak,
                        score: res.score ?? viewAfter.score,
                    }
                    : null);

        if (noteResultPayload) {
            pushEvent("note_result", {
                session_id: sessionCtx.id,
                lesson_id: sessionCtx.lessonId,
                ...noteResultPayload,
            });
        }

        // 3.1 Visual Feedback for Hit (Engine advanced) - WAIT only
        if (practiceMode === "WAIT" && viewAfter.currentStep > viewBefore.currentStep && featureFlagSnapshot.showSheetMusic) {
            osmdCtrl?.colorizeCursor("HIT");
        }

        // 3.2 HUD update
        if (practiceMode === "FILM") {
            const beatHud = lastFilmSnapshot ? Math.max(0, lastFilmSnapshot.transportBeat) : 0;
            const filmStepHud = getFilmStepFromBeat(beatHud);
            const totalHudSteps = currentSchemaVersion === 2 ? lessonSteps.length : lessonNotes.length;
            const nowHud = performance.now();
            const statusFlash = filmHudFlash && nowHud < filmHudFlash.untilMs ? filmHudFlash.status : null;
            const status =
                (judge?.result && judge.result !== "NONE"
                    ? judge.result
                    : statusFlash) ??
                (lastFilmSnapshot?.status === "COUNTING" ? "COUNTING" : "PLAYING");

            // Timing Debug Update
            if (timingDebugValue && judge?.deltaMs !== undefined) {
                const val = Math.round(judge.deltaMs);
                const sign = val > 0 ? "+" : "";
                timingDebugValue.textContent = `${sign}${val}ms`;
                // Green if within tight window (e.g. 50ms), Red otherwise. 
                // Or maybe Yellow for late/early but hit? 
                // Let's use simple logic: Green < 50, Yellow < 100, Red > 100
                const absVal = Math.abs(val);
                timingDebugValue.style.color = absVal < 50 ? "#4ade80" : (absVal < 120 ? "#facc15" : "#f87171");
            }

            ui.updateHud({
                step: filmStepHud,
                total: totalHudSteps,
                status,
                scoreTotal: viewAfter.score,
                streak: viewAfter.streak,
                bestStreak: viewAfter.bestStreak,
            });
            // FILM: do not run WAIT cursor advance logic
            return;
        }

        ui.updateHud({
            step: viewAfter.currentStep,
            total: viewAfter.totalSteps,
            status: res?.result ?? viewAfter.lastResult ?? viewAfter.status,
            scoreTotal: viewAfter.score,
            streak: viewAfter.streak,
            bestStreak: viewAfter.bestStreak,
        });

        const expectedAfter = engine.getExpectedMidi(viewBefore.currentStep);
        console.debug("[ENGINE_FRAME]", {
            session_id: sessionCtx.id,
            mode: practiceMode,
            isOn,
            midi: midiInt,
            stepBefore: viewBefore.currentStep,
            stepAfter: viewAfter.currentStep,
            total: viewAfter.totalSteps,
            expected: expectedAfter,
            expectedName: midiToName(expectedAfter),
            lastResult: viewAfter.lastResult,
            result: res?.result ?? viewAfter.lastResult ?? "NONE",
            score: viewAfter.score,
            streak: viewAfter.streak,
            bestStreak: viewAfter.bestStreak
        });

        if (practiceMode === "WAIT") {
            const expectedAfter = engine.getExpectedMidi(viewBefore.currentStep);
            console.debug("[WAIT]", {
                session_id: sessionCtx.id,
                seq: sessionCtx.seq,
                step_before: viewBefore.currentStep,
                step_after: viewAfter.currentStep,
                total: viewAfter.totalSteps,
                pitch: midiInt,
                expected: expectedAfter,
                expectedName: midiToName(expectedAfter),
                result: res?.result ?? "NONE",
                score: viewAfter.score,
                streak: viewAfter.streak,
            });
        }



        // 4. Send to server for relay/logging (maintain compatibility)
        wsTransport?.send({ type: "debug_note_input", midi: midiInt, velocity: velInt, source });

        updateDebugHud(source, midiInt);

        if (debugInputLogging) {
            console.debug("[INPUT]", { source, midi: midiInt, noteName: midiToNote(midiInt), velocity: velInt });
        }
    };

    const handleEscapeDisable = () => {
        if (!debugMouseEnabled && !debugKeyboardEnabled) return;
        debugMouseEnabled = false;
        debugKeyboardEnabled = false;
        if (debugMouseToggle) debugMouseToggle.checked = false;
        if (debugKeyboardToggle) debugKeyboardToggle.checked = false;
        syncDebugInputState();
    };

    const handleDebugKeyDown = (event: KeyboardEvent) => {
        if (!debugKeyboardEnabled || !isTrainerActive()) return;
        if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === "Escape") {
            handleEscapeDisable();
            return;
        }

        if (isTextInputTarget(event.target)) return;

        const key = event.key.toLowerCase();
        const midi = KEY_TO_MIDI[key];
        if (!midi || midi < DEBUG_NOTE_RANGE.min || midi > DEBUG_NOTE_RANGE.max) return;

        if (pressedKeyboardKeys.has(key)) return;
        pressedKeyboardKeys.add(key);

        console.debug("[KBD]", { code: event.code, key: event.key, pitch: midi, name: midiToName(midi) });
        handleNoteInput(midi, 96, "keyboard");
        event.preventDefault();
    };

    const handleDebugKeyUp = (event: KeyboardEvent) => {
        if (!debugKeyboardEnabled || !isTrainerActive()) return;

        const key = event.key.toLowerCase();
        if (!pressedKeyboardKeys.has(key)) return;

        const midi = KEY_TO_MIDI[key];
        if (midi) handleNoteInput(midi, 0, "keyboard");

        pressedKeyboardKeys.delete(key);
    };

    const attachKeyboardListeners = () => {
        if (keyboardListenersAttached) return;
        window.addEventListener("keydown", handleDebugKeyDown);
        window.addEventListener("keyup", handleDebugKeyUp);
        keyboardListenersAttached = true;
    };

    const detachKeyboardListeners = () => {
        if (!keyboardListenersAttached) return;
        window.removeEventListener("keydown", handleDebugKeyDown);
        window.removeEventListener("keyup", handleDebugKeyUp);
        keyboardListenersAttached = false;
        pressedKeyboardKeys.clear();
    };

    const syncDebugInputState = () => {
        const trainerActive = isTrainerActive();

        if (debugMouseToggle) debugMouseToggle.disabled = !trainerActive;
        if (debugKeyboardToggle) debugKeyboardToggle.disabled = !trainerActive;

        const mouseEnabled = trainerActive && debugMouseEnabled;
        if (featureFlagSnapshot.showFallingNotes) {
            const pr = ensurePianoRoll();
            pr?.setMouseInputEnabled(mouseEnabled);
        }

        const keyboardEnabled = trainerActive && debugKeyboardEnabled;
        if (keyboardEnabled) {
            attachKeyboardListeners();
            if (featureFlagSnapshot.showFallingNotes) {
                const pr = ensurePianoRoll();
                pr?.setKeyboardLabels(MIDI_TO_KEY_LABEL);
            }
        } else {
            if (pressedKeyboardKeys.size) {
                pressedKeyboardKeys.forEach((key) => {
                    const midi = KEY_TO_MIDI[key];
                    if (midi) handleNoteInput(midi, 0, "keyboard");
                });
                pressedKeyboardKeys.clear();
            }
            detachKeyboardListeners();
            if (featureFlagSnapshot.showFallingNotes) {
                const pr = ensurePianoRoll();
                pr?.setKeyboardLabels(null);
            }
        }

        updateDebugHud();
    };

    const syncFlagToggles = () => {
        if (flagSheetToggle) flagSheetToggle.checked = featureFlagSnapshot.showSheetMusic;
        if (flagFallingToggle) flagFallingToggle.checked = featureFlagSnapshot.showFallingNotes;
    };

    // Apply initial mount according to flags (after handlers and debug sync are available)
    syncFlagToggles();
    sheetSection.classList.toggle('is-hidden', !featureFlagSnapshot.showSheetMusic);
    if (featureFlagSnapshot.showSheetMusic) ensureSheet();
    if (featureFlagSnapshot.showFallingNotes) ensurePianoRoll();

    featureFlags.subscribe((next, meta) => {
        featureFlagSnapshot = next;
        syncFlagToggles();
        if (!next.showSheetMusic) {
            destroySheet();
            sheetSection.classList.add('is-hidden');
        } else {
            sheetSection.classList.remove('is-hidden');
            const sheet = ensureSheet();
            rebuildSheetMappings();
            if (practiceMode === "FILM" && sheet) {
                sheet.setFilmMode(true, { pixelsPerBeat: FILM_PIXELS_PER_BEAT });
            }
        }
        if (!next.showFallingNotes) {
            destroyPianoRoll();
        } else {
            ensurePianoRoll();
        }
        console.log("[FeatureFlags] update", { source: meta.source, name: meta.name, next });
    });

    // --- MIDI Popover & Status ---
    const renderMidiState = () => {
        const statusLabel = midiState.connected
            ? `MIDI: ${midiState.activePort || midiState.selectedPort || "Conectado"}`
            : "MIDI: OFFLINE";

        if (midiStatusLabel) midiStatusLabel.textContent = statusLabel;
        if (midiPopoverStatus) {
            midiPopoverStatus.textContent = statusLabel;
            midiPopoverStatus.classList.toggle("is-connected", midiState.connected);
        }
        if (midiToggleBtn?.parentElement?.classList.contains("midi-control")) {
            midiToggleBtn.parentElement.classList.toggle("is-open", midiPopoverOpen);
        }
        if (midiToggleBtn) {
            midiToggleBtn.classList.toggle("is-connected", midiState.connected);
        }

        if (midiPortSelect) {
            const ports = midiState.ports.length ? midiState.ports : ["Nenhuma porta detectada"];
            midiPortSelect.innerHTML = "";
            ports.forEach((port) => {
                const option = document.createElement("option");
                option.value = midiState.ports.length ? port : "";
                option.textContent = port;
                midiPortSelect.appendChild(option);
            });
            const target =
                midiState.selectedPort ||
                midiState.activePort ||
                (midiPortSelect.options.length ? midiPortSelect.options[0].value : "");
            midiPortSelect.value = target ?? "";
        }

        if (midiErrorEl) {
            const hasError = !!midiState.error;
            midiErrorEl.textContent = midiState.error ?? "";
            midiErrorEl.toggleAttribute("hidden", !hasError);
        }


    };

    const setMidiPopoverOpen = (open: boolean) => {
        midiPopoverOpen = open;
        if (midiPopover) midiPopover.hidden = !open;
        if (midiToggleBtn?.parentElement?.classList.contains("midi-control")) {
            midiToggleBtn.parentElement.classList.toggle("is-open", open);
        }
    };

    function requestMidiStatus() {
        midiState.pending = true;
        renderMidiState();
        wsTransport?.send({ type: "midi_status_request" });
    }

    function connectSelectedMidi() {
        const selected = midiPortSelect?.value?.trim();
        midiState.pending = true;
        renderMidiState();
        wsTransport?.send({ type: "midi_connect", port: selected || null });
    }

    function disconnectMidi() {
        midiState.pending = true;
        renderMidiState();
        wsTransport?.send({ type: "midi_disconnect" });
    }

    function handleMidiStatus(payload: MidiStatusMessage) {
        // Ensure ports is always string[] for now as per this file's usage
        const nextPorts: string[] = Array.isArray(payload.ports)
            ? payload.ports
                .filter((p): p is string => typeof p === "string" && p.length > 0)
            : midiState.ports;

        const selected = payload.selected_port ?? payload.requested_port ?? midiState.selectedPort;
        const active = payload.active_port ?? midiState.activePort;

        midiState = {
            ...midiState, // preserve other properties if any
            ports: nextPorts,
            selectedPort: selected ?? active ?? null,
            activePort: active ?? null,
            connected: payload.connected ?? midiState.connected,
            error: payload.error ?? null,
            pending: false,
        };
        renderMidiState();
        emitConnectionStatus({
            isConnected: midiState.connected,
            deviceName: midiState.connected
                ? midiState.activePort || midiState.selectedPort || "MIDI conectado"
                : midiState.error || "MIDI desconectado",
        });
    }

    // --- Chapter Overlay Logic (Restored) ---
    const updateChapterMeta = () => {
        if (!chapterOverlayMeta) return;
        if (restSessionDisabledReason) {
            chapterOverlayMeta.textContent = restSessionDisabledReason;
            return;
        }
        if (chapterCatalogStatus === "ready") {
            const timestamp = formatTimestamp(chapterCatalogGeneratedAt);
            const countLabel = `${chapterCatalog.length} capítulo${chapterCatalog.length === 1 ? "" : "s"}`;
            chapterOverlayMeta.textContent = timestamp ? `${countLabel} · Atualizado ${timestamp}` : countLabel;
            return;
        }
        if (chapterCatalogStatus === "loading") {
            chapterOverlayMeta.textContent = "Carregando capítulos...";
            return;
        }
        if (chapterCatalogStatus === "error") {
            chapterOverlayMeta.textContent = "Não foi possível carregar capítulos";
            return;
        }
        chapterOverlayMeta.textContent = "Aguardando catálogo...";
    };

    const createOverlayState = (message: string, actionLabel?: string, onAction?: () => void) => {
        const wrapper = document.createElement("div");
        wrapper.className = "chapter-overlay-state";
        const text = document.createElement("p");
        text.textContent = message;
        wrapper.appendChild(text);
        if (actionLabel && onAction) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "chapter-secondary-btn";
            button.textContent = actionLabel;
            button.addEventListener("click", onAction);
            wrapper.appendChild(button);
        }
        return wrapper;
    };

    const buildChapterCard = (chapter: ChapterCatalogItem) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "chapter-card chapter-card-button";
        const isLocked = chapter.unlocked === false; // Default to unlocked if field is missing
        if (isLocked) {
            card.disabled = true;
            card.classList.add("is-locked");
        }
        if (activeChapterId !== null && chapter.chapter_id === activeChapterId) {
            card.classList.add("is-active");
        }

        const header = document.createElement("header");
        header.className = "chapter-card-header";
        const titleWrap = document.createElement("div");
        titleWrap.className = "chapter-card-title";
        const title = document.createElement("h3");
        title.textContent = chapter.title || `Capítulo ${chapter.chapter_id}`;
        titleWrap.appendChild(title);
        if (chapter.subtitle) {
            const subtitle = document.createElement("p");
            subtitle.className = "chapter-subtitle";
            subtitle.textContent = chapter.subtitle;
            titleWrap.appendChild(subtitle);
        }

        const badges = document.createElement("div");
        badges.className = "chapter-card-badges";
        const statusPill = document.createElement("span");
        statusPill.className = `status-pill ${isLocked ? "status-miss" : "status-hit"}`;
        statusPill.innerHTML = isLocked ? "Bloqueado" : "Disponível";
        badges.appendChild(statusPill);
        if (chapter.difficulty != null) {
            const diff = document.createElement("span");
            diff.className = "status-pill status-muted";
            diff.textContent = `Nível ${chapter.difficulty}`;
            badges.appendChild(diff);
        }
        header.append(titleWrap, badges);

        // Progress
        const progressTrack = document.createElement("div");
        progressTrack.className = "progress-track";
        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        const progressPct = normalizeProgress(chapter.progress_pct);
        progressBar.style.width = `${progressPct}%`;
        progressTrack.appendChild(progressBar);

        const statsTable = document.createElement("div");
        statsTable.className = "chapter-stats-grid";
        statsTable.innerHTML = `
      <div class="stat-row"><span>Sessões</span><strong>${chapter.kpis?.sessions_total ?? 0}</strong></div>
      <div class="stat-row"><span>Acurácia</span><strong>${formatPercent(chapter.kpis?.accuracy) ?? "--"}</strong></div>
    `;

        card.append(header, progressTrack, statsTable);
        if (!isLocked) {
            card.addEventListener("click", () => startChapter(chapter.chapter_id));
        }
        return card;
    };

    const renderChapterOverlay = () => {
        if (!chapterOverlayContent) return;
        updateChapterMeta();
        if (chapterSearchInput) chapterSearchInput.disabled = chapterCatalogStatus !== "ready";
        if (chapterRefreshBtn) chapterRefreshBtn.hidden = chapterCatalogStatus !== "error";
        chapterOverlayContent.innerHTML = "";

        if (chapterCatalogStatus === "loading") {
            chapterOverlayContent.appendChild(createOverlayState("Carregando capítulos..."));
            return;
        }
        if (chapterCatalogStatus === "error") {
            chapterOverlayContent.appendChild(createOverlayState(`Erro: ${chapterCatalogError}`, "Tentar de novo", requestChapterCatalog));
            return;
        }
        if (chapterCatalogStatus !== "ready" || !chapterCatalog.length) {
            chapterOverlayContent.appendChild(createOverlayState("Nenhum capítulo disponível"));
            return;
        }

        const term = chapterSearchTerm.trim().toLowerCase();
        const filtered = term ? chapterCatalog.filter(c => c.title.toLowerCase().includes(term)) : chapterCatalog;

        if (!filtered.length) {
            chapterOverlayContent.appendChild(createOverlayState("Nenhum capítulo encontrado"));
            return;
        }

        const list = document.createElement("div");
        list.className = "chapter-overlay-list";
        filtered.forEach(ch => list.appendChild(buildChapterCard(ch)));
        chapterOverlayContent.appendChild(list);
    };

    const requestChapterCatalog = async () => {
        // Check if catalog is already loaded
        if (catalogService.isReady()) {
            const catalog = catalogService.getCatalog();
            if (catalog) {
                console.log('[CATALOG] Using cached catalog');
                handleChapterCatalog(catalog);
                return;
            }
        }

        // Not loaded yet - fetch it
        pendingChapterCatalogRequest = true;
        chapterCatalogStatus = "loading";
        renderChapterOverlay();

        // In REST mode, fetch catalog directly via service
        if (!wsTransport.send) {
            try {
                const catalog = await catalogService.load(wsTransport);
                handleChapterCatalog(catalog);
            } catch (error) {
                console.error('[CATALOG] REST fetch failed:', error);
                chapterCatalogStatus = "error";
                chapterCatalogError = error instanceof Error ? error.message : "Failed to load catalog";
                renderChapterOverlay();
            }
            return;
        }

        // WebSocket mode - send message
        const res = wsTransport.send?.({ type: "chapter_catalog_request", version: 1 }, { dedupeKey: "chapter_catalog_request" });
        catalogRequestQueued = res === "queued";


        // Timeout safeguard
        if (chapterCatalogTimeout) clearTimeout(chapterCatalogTimeout);
        chapterCatalogTimeout = window.setTimeout(() => {
            if (chapterCatalogStatus === "loading") {
                chapterCatalogStatus = "error";
                chapterCatalogError = "Timeout";
                renderChapterOverlay();
            }
        }, CHAPTER_CATALOG_TIMEOUT_MS);
    };

    async function startLessonViaRest(chapterId: number) {
        if (!useRestSessionLesson) return;
        let lessonId = catalogService.getChapterLessonId(chapterId);
        if (!lessonId) {
            console.warn(`[REST LESSON] No lesson mapping for chapter ${chapterId}, attempting to load catalog...`);
            await catalogService.load(wsTransport);
            lessonId = catalogService.getChapterLessonId(chapterId);
        }
        if (!lessonId) {
            if (!featureFlags.get('useWebSocket')) {
                console.error(`[REST LESSON] lesson_id não encontrado para chapter_id=${chapterId}. WebSocket desativado — lição não carregada.`);
                return;
            }
            console.warn("[REST LESSON] lesson_id não encontrado; fallback para WS");
            useRestSessionLesson = false;
            restSessionDisabledReason = "lesson_id não encontrado; usando somente WebSocket.";
            return;
        }
        const sessionPayload = {
            lesson_id: lessonId,
            client: buildSessionClientInfo(),
            session_config: buildSessionConfig(),
        };
        try {
            const sessionData = await fetchWithAuth("/v1/sessions", {
                method: "POST",
                body: JSON.stringify(sessionPayload),
            });
            const lessonData = await fetchWithAuth(`/v1/sessions/${sessionData.session_id}/lesson`, {
                method: "GET",
            });
            handleLessonContent(toLessonContentPayload(lessonData), { targetMode: "WAIT", reason: "rest_session" });
            console.log(
                `[REST LESSON] session_id=${sessionData.session_id} score_len=${lessonData.score_xml?.length ?? 0} notes=${(
                    lessonData.notes ?? []
                ).length}`,
            );
        } catch (error) {
            if (isLessonNotFoundError(error)) {
                disableRestSession("REST não encontrou a lição; usando somente WebSocket.");
                return;
            }
            console.warn("[REST LESSON] erro ao iniciar via REST; fallback para WS", error);
            disableRestSession("Falha ao iniciar sessão via REST; usando somente WebSocket.");
        }
    }

    /** Start a lesson by explicit lesson_id (for upload chapters with multiple lessons) */
    async function startLessonViaRestWithLessonId(chapterId: number, lessonId: string) {
        const sessionPayload = {
            lesson_id: lessonId,
            client: buildSessionClientInfo(),
            session_config: buildSessionConfig(),
        };
        try {
            const sessionData = await fetchWithAuth("/v1/sessions", {
                method: "POST",
                body: JSON.stringify(sessionPayload),
            });
            const lessonData = await fetchWithAuth(`/v1/sessions/${sessionData.session_id}/lesson`, {
                method: "GET",
            });
            handleLessonContent(toLessonContentPayload(lessonData), { targetMode: "WAIT", reason: "rest_upload_lesson" });
            console.log(`[REST LESSON] upload lesson started: chapter=${chapterId} lesson=${lessonId} session=${sessionData.session_id}`);
        } catch (error) {
            console.error(`[REST LESSON] Failed to start upload lesson chapter=${chapterId} lesson=${lessonId}`, error);
        }
    }

    const startChapter = (chapterId: number) => {
        pendingStartChapterId = chapterId;
        resetSessionState("chapter_change_pending");
        sessionCtx = { ...sessionCtx, id: null, lessonId: null };
        if (featureFlags.get('useWebSocket')) {
            wsTransport.send?.(
                {
                    type: "start_chapter",
                    chapter_id: chapterId,
                    practice_mode: practiceMode,
                });
        }
        setChapterOverlayOpen(false);
        if (useRestSessionLesson) {
            startLessonViaRest(chapterId).catch((error) => {
                console.warn(`[REST LESSON] fallback WS chapter_id=${chapterId}`, error);
            });
        }
    };

    /** Start a chapter with a specific lesson ID (e.g. from upload chapters with multiple lessons) */
    const startChapterWithLesson = (chapterId: number, lessonId: string) => {
        pendingStartChapterId = chapterId;
        resetSessionState("chapter_change_pending");
        sessionCtx = { ...sessionCtx, id: null, lessonId: null };
        setChapterOverlayOpen(false);
        // Go directly via REST with the specific lesson_id
        startLessonViaRestWithLessonId(chapterId, lessonId).catch((error) => {
            console.warn(`[REST LESSON] fallback for upload lesson chapter=${chapterId} lesson=${lessonId}`, error);
        });
    };

    const setChapterOverlayOpen = (open: boolean) => {
        chapterOverlayOpen = open;
        if (chapterOverlay) {
            chapterOverlay.classList.toggle("is-open", open);
            chapterOverlay.setAttribute("aria-hidden", open ? "false" : "true");
        }
        if (open) requestChapterCatalog();
    };

    // --- Transport Tick (Game Loop) ---
    transportClient.onTick((snapshot: TransportSnapshot) => {
        // 1. Tick Engine / film bookkeeping
        if (practiceMode === "FILM") {
            lastFilmSnapshot = snapshot;
            const tickRes = engine.tickFilm(snapshot.transportBeat, snapshot.bpm, FILM_HIT_WINDOW_MS);
            if (tickRes?.result === "MISS") {
                flashFilmStatus("MISS");
                console.debug("[FILM_MISS]", { beatNow: snapshot.transportBeat, bpm: snapshot.bpm, step: tickRes.step, deltaMs: tickRes.deltaMs });
            } else if (tickRes?.result === "LATE") {
                flashFilmStatus("LATE");
                console.debug("[FILM_LATE]", { beatNow: snapshot.transportBeat, bpm: snapshot.bpm, step: tickRes.step, deltaMs: tickRes.deltaMs });
            }
        } else {
            lastFilmSnapshot = null;
        }

        // 2. Get View State & Render
        const view = engine.getViewState();
        renderView(view, snapshot);

        // 4. Metronome
        if (metronomeToggle && metronomeToggle.checked) {
            transportMetronome.setEnabled(true);
            transportMetronome.sync(snapshot as any); // cast for compatibility with ITransportState
        } else {
            transportMetronome.setEnabled(false);
        }

        // 5. Update HUD (Wait Mode Fallback)
        if (practiceMode === 'WAIT') {
            ui.updateHud({
                step: view.currentStep,
                total: view.totalSteps,
                status: view.lastResult ?? view.status,
                scoreTotal: view.score,
                streak: view.streak,
                bestStreak: view.bestStreak
            });
        }

        // 6. Flush Analytics
        const analyticsBatch = engine.flushAnalytics();
        if (analyticsBatch) {
            wsTransport.send?.(analyticsBatch);
        }
    });

    // --- Message Handlers ---
    function handleLessonContent(payload: LessonContentPacket, opts?: { targetMode?: LessonMode; reason?: string }) {
        if ((payload as any).user_uuid) persistLocalUserUuid((payload as any).user_uuid);
        if (payload.session_id && sessionCtx.id && payload.session_id !== sessionCtx.id) {
            console.warn("[DROP_REMOTE]", { why: "session_mismatch", payloadSession: payload.session_id, currentSession: sessionCtx.id });
            return;
        }
        beginSession(payload, opts);
    }

    const handleMidiInput = (payload: any) => {
        if (payload?.session_id && sessionCtx.id && payload.session_id !== sessionCtx.id) {
            console.debug("[DROP_REMOTE]", { why: "session_mismatch", payloadSession: payload.session_id, currentSession: sessionCtx.id });
            return;
        }
        const midi = Math.max(0, Math.min(127, Math.round(payload.midi)));
        const isOn = payload.is_on === true || payload.velocity > 0;

        // Deduplication check: is this just an echo of our local input?
        // Independent of 'source' payload field to be robust against server echoes
        const now = performance.now();
        const isEcho = (debugMouseEnabled || debugKeyboardEnabled) &&
            lastLocalInput.midi === midi &&
            lastLocalInput.isOn === isOn &&
            (now - lastLocalInput.time < 100);

        // 1. Logic (only if not echo)
        let advanced = false;
        if (!isEcho) {
            const stepBefore = engine.getViewState().currentStep;
            engine.onMidiInput(midi, payload.velocity, isOn);
            const stepAfter = engine.getViewState().currentStep;
            if (stepAfter > stepBefore) advanced = true;
        }

        // 2. Visual
        if (featureFlagSnapshot.showFallingNotes) {
            const pr = ensurePianoRoll();
            pr?.setActiveNote(midi, isOn);
        }

        // 3. Feedback Visual (If HIT)
        if (advanced && featureFlagSnapshot.showSheetMusic) {
            osmdCtrl?.colorizeCursor('HIT');
        }

        // 4. Debug HUD
        updateDebugHud("midi", midi);
        if (debugInputLogging && !isEcho) {
            console.log("[INPUT]", midi, payload.velocity);
        }
    };

    const handleChapterCatalog = (payload: any) => {
        if (chapterCatalogTimeout) {
            clearTimeout(chapterCatalogTimeout);
            chapterCatalogTimeout = null;
        }
        pendingChapterCatalogRequest = false;

        if (payload && Array.isArray(payload.chapters)) {
            chapterCatalog = payload.chapters;
            chapterCatalogStatus = "ready";
            chapterCatalogGeneratedAt = payload.generated_at || Date.now();

            if (dashboardState.stats) {
                hydrateChapterCatalogWithStats(dashboardState.stats);
            } else {
                renderChapterOverlay();
            }
        } else {
            chapterCatalogStatus = "error";
            chapterCatalogError = "Dados inválidos recebidos do servidor.";
            renderChapterOverlay();
        }
    };

    const handleIncomingMessage = (data: any) => {
        if (!data) return;
        switch (data.type) {
            case 'lesson_content': handleLessonContent(data); break;
            case 'midi_input': handleMidiInput(data); break;
            case 'done': engine.forceEnd(); break;
            case 'chapter_catalog':
                handleChapterCatalog(data);
                break;
            case 'midi_status': handleMidiStatus(data as MidiStatusMessage); break;
            case 'start_chapter_ack':
                if (data.ok) { activeChapterId = data.chapter_id; setRoute("trainer"); }
                else alert(data.message);
                pendingStartChapterId = null;
                break;
            case 'error': alert(data.message); break;
        }
    };

    const handleWsStatusChange = (state: WsState, reason?: string) => {
        ui.updateWsStatus(state, reason);

        // Prioritize REST status if available
        let finalConnected = state === 'connected';
        let finalName = state === 'connected' ? 'Servidor ativo' : 'Offline';

        if (!finalConnected && catalogService.isReady()) {
            finalConnected = true;
            finalName = 'Conectado (REST API)';
        }

        emitConnectionStatus({
            isConnected: finalConnected,
            deviceName: finalName
        });

        if (state === 'connected') {
            if (catalogRequestQueued) {
                wsTransport.send?.({ type: "chapter_catalog_request", version: 1 }, { dedupeKey: "chapter_catalog_request" });
                catalogRequestQueued = false;
            }
            requestMidiStatus();
        } else {
            markMidiDisconnected("Conexão perdida");
        }
    };

    function markMidiDisconnected(msg: string) {
        midiState = { ...midiState, connected: false, activePort: null, error: msg };
        renderMidiState();
    }

    // --- Boot ---
    wsTransport = createTransport(handleIncomingMessage, handleWsStatusChange);
    wsTransport.connect();

    // Load catalog via centralized service (REST mode only)
    // WebSocket mode gets catalog via message protocol
    if (!wsTransport.send) {
        catalogService.load(wsTransport)
            .then(() => {
                console.log('[BOOT] ✅ Catalog loaded via REST');
                emitBackendStatus({ connected: true, label: 'Conectado (REST API)' });
            })
            .catch((error) => {
                console.warn('[BOOT] ⚠️ Failed to load catalog via REST:', error);
                disableRestSession("Falha ao carregar catálogo REST; usando somente WebSocket.");
            });
    }

    // Initialize Listeners
    practiceModeSelect?.addEventListener("change", () =>
        switchPracticeMode(resolvePracticeMode(practiceModeSelect.value), "user_select", { restartSession: true })
    );
    bpmInput?.addEventListener("input", () => {
        const v = toNum(bpmInput.value);
        if (v > 0) transportClient.setBpm(v);
    });
    bpmInput?.addEventListener("change", () => {
        const v = toNum(bpmInput.value);
        if (v > 0) {
            transportClient.setBpm(v);
            wsTransport?.send({ type: "set_bpm", bpm: v });
        }
    });

    // Transpose Listener
    transposeInput?.addEventListener("change", () => {
        const raw = parseInt(transposeInput.value, 10);
        const clampedVal = isNaN(raw) ? 0 : Math.max(-12, Math.min(12, raw));
        transposeInput.value = String(clampedVal);
        if (clampedVal !== transpositionSemitones) {
            transpositionSemitones = clampedVal;
            if (lastLessonContent) {
                beginSession(lastLessonContent, { targetMode: practiceMode, reason: "transposition_change" });
            }
        }
    });

    // Transport Listeners
    playPauseBtn?.addEventListener("click", () => {
        if (transportClient.isPlaying()) {
            transportClient.pause();
        } else if (transportClient.isPausedState()) {
            transportClient.resume();
        } else {
            transportClient.start();
        }
        updateTransportControls();
    });

    // Reset button - reinicia a lição mantendo o modo atual (FILM ou WAIT)
    resetBtn?.addEventListener("click", () => {
        if (!lastLessonContent) return;
        if (typeof lessonTimer !== 'undefined') lessonTimer.reset();
        transportClient.reset();
        transportMetronome.reset();
        const resetSheet = featureFlagSnapshot.showSheetMusic && osmdCtrl
            ? osmdCtrl.reset()
            : Promise.resolve();
        resetSheet.then(() => {
            // Recarrega a lição com nova sessão, mantendo o modo atual
            const freshPayload = { ...lastLessonContent, session_id: generateSessionId() };
            beginSession(freshPayload, { targetMode: practiceMode, reason: "reset_button" });
            updateTransportControls();
        });
    });

    // Debug listeners
    attachNoteInputHandler();
    debugMouseToggle?.addEventListener("change", () => { debugMouseEnabled = !!debugMouseToggle.checked; syncDebugInputState(); });
    debugKeyboardToggle?.addEventListener("change", () => { debugKeyboardEnabled = !!debugKeyboardToggle.checked; syncDebugInputState(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") handleEscapeDisable(); });
    syncDebugInputState();

    // Dashboard logic
    const bootstrapDashboardFromCache = () => {
        const cached = analyticsClient.loadCache();
        if (cached) {
            dashboardState = { status: "stale", stats: cached.stats, source: "cache", lastUpdated: cached.timestamp, error: null };
        }
    };
    const renderDashboardView = (status?: DashboardStatus) => {
        if (!dashboardRoot) return;
        if (dashboardReactRoot) {
            dashboardReactRoot.render(
                <Dashboard stats={dashboardState.stats} status={status ?? dashboardState.status} lastUpdated={dashboardState.lastUpdated ?? undefined} error={dashboardState.error ?? undefined} source={dashboardState.source} />
            );
        }
    };
    const fetchStats = async () => {
        dashboardState.status = "loading"; renderDashboardView();
        try {
            const { stats, source } = await analyticsClient.fetchOverview(30);
            dashboardState = { status: "live", stats, source, lastUpdated: Date.now(), error: null };
            hydrateChapterCatalogWithStats(stats);
        } catch (e: any) {
            dashboardState.status = "error"; dashboardState.error = formatDashboardError(e);
        }
        renderDashboardView();
    };

    const hydrateChapterCatalogWithStats = (stats: StatsViewModel) => {
        if (!chapterCatalog.length) return;
        const map = new Map(stats.chapters.map(c => [Number(c.chapter_id), c]));
        chapterCatalog = chapterCatalog.map(c => {
            const s = map.get(Number(c.chapter_id));
            if (!s) return c;
            return {
                ...c,
                progress_pct: Number(s.progress_pct),
                kpis: { accuracy: s.accuracy_avg, sessions_total: s.sessions_total, latency_avg: s.latency_avg, streak_best: stats.kpis?.best_streak },
                heatmap_summary: { hard_notes: s.heatmap_top_notes.map(n => n.midi) }
            };
        });
        renderChapterOverlay();
    };



    // ===== MIDI UI Event Listeners =====
    // MIDI Toggle Button
    midiToggleBtn?.addEventListener('click', () => {
        console.log('[MIDI] Button clicked! Current midiPopoverOpen:', midiPopoverOpen);
        midiPopoverOpen = !midiPopoverOpen;
        console.log('[MIDI] New midiPopoverOpen:', midiPopoverOpen);
        updateMidiPopover();

        // Request access on first open if not yet tried
        if (midiPopoverOpen && !midiState.accessGranted && !midiState.error) {
            console.log('[MIDI] Requesting MIDI access...');
            requestMidiAccess();
        }
    });

    // MIDI Refresh Button
    midiRefreshBtn?.addEventListener('click', async () => {
        await requestMidiAccess();
    });

    // MIDI Connect Button
    midiConnectBtn?.addEventListener('click', () => {
        const selectedPortId = midiPortSelect?.value;
        if (selectedPortId) {
            webMidiService.selectPort(selectedPortId);
        }
    });

    // MIDI Disconnect Button
    midiDisconnectBtn?.addEventListener('click', () => {
        webMidiService.disconnectPort();
    });

    // Port Select Change
    midiPortSelect?.addEventListener('change', () => {
        const selectedPortId = midiPortSelect.value;
        if (selectedPortId) {
            webMidiService.selectPort(selectedPortId);
        }
    });

    // Initial MIDI UI update
    updateMidiUI();

    // Close MIDI popover when clicking outside
    document.addEventListener('click', (e) => {
        if (!midiPopoverOpen) return;

        const target = e.target as HTMLElement;
        const isInsidePopover = midiPopover?.contains(target);
        const isToggleButton = midiToggleBtn?.contains(target);

        if (!isInsidePopover && !isToggleButton) {
            midiPopoverOpen = false;
            updateMidiPopover();
        }
    });

    // Chapter Overlay Listeners
    chapterToggleBtn?.addEventListener("click", () => {
        if (featureFlags.get('showNewCurriculum')) {
            openTrailNavigator();
        } else {
            setChapterOverlayOpen(!chapterOverlayOpen);
        }
    });
    chapterCloseBtn?.addEventListener("click", () => setChapterOverlayOpen(false));
    chapterOverlayBackdrop?.addEventListener("click", () => setChapterOverlayOpen(false));
    chapterRefreshBtn?.addEventListener("click", requestChapterCatalog);
    chapterSearchInput?.addEventListener("input", (e) => {
        chapterSearchTerm = (e.target as HTMLInputElement).value;
        renderChapterOverlay();
    });

    // Nav Buttons
    document.querySelectorAll("[data-route]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            setRoute((e.target as HTMLElement).dataset.route || "home");
        });
    });

    // User avatar → Settings
    const refreshInitials = async () => {
        try {
            const user = await authService.getUser();
            const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';
            const parts = name.trim().split(/\s+/).filter(Boolean);
            const initials = parts.length >= 2
                ? (parts[0][0] + parts[1][0]).toUpperCase()
                : (name[0]?.toUpperCase() ?? '?');
            const el = document.getElementById('user-initials');
            if (el) el.textContent = initials;
        } catch { /* silencioso */ }
    };

    document.getElementById('user-menu-btn')?.addEventListener('click', () => {
        setRoute('settings');
    });

    window.addEventListener('auth:success', () => { refreshInitials(); });
    window.addEventListener('profile:updated', () => { refreshInitials(); });
    window.addEventListener('auth:logout', () => {
        clearAuthStorage();
        window.location.reload();
    });

    refreshInitials();

    // URL Route
    if (window.location.pathname.includes("/viewer/trainer")) setRoute("trainer");

    // Home Start
    if (homeReactRoot) {
        homeReactRoot.render(<HomeShell onStartSession={(activity: any) => {
            if (activity?.type === 'chapter' && typeof activity.chapterId === 'number') {
                startChapter(activity.chapterId);
            }
            setRoute('trainer');
        }} />);
    }

    // Audio Playback Toggle
    const updateAudioButtonState = () => {
        const isEnabled = audioService.getEnabled();
        if (audioOffIcon) audioOffIcon.style.display = isEnabled ? "none" : "";
        if (audioOnIcon) audioOnIcon.style.display = isEnabled ? "" : "none";
        if (audioPlayBtn) {
            audioPlayBtn.classList.toggle("active", isEnabled);
            audioPlayBtn.title = isEnabled ? "Desativar Áudio" : "Ativar Áudio";
        }
    };

    audioPlayBtn?.addEventListener("click", async () => {
        await audioService.initialize();
        audioService.setEnabled(!audioService.getEnabled());
        updateAudioButtonState();
    });

    // Initial Catalog Request
    requestChapterCatalog();
};

const startApp = async () => {
    // Auth is non-blocking: if it fails, the app still loads with
    // local catalog and chapter navigation working. Only API calls
    // that require auth (REST sessions, analytics) will fail gracefully.
    try {
        await ensureAuthenticated();
        console.log('[AUTH] ✅ autenticado, iniciando app');
    } catch (err) {
        console.warn('[AUTH] ⚠️ Auth não disponível, continuando sem autenticação:', err instanceof Error ? err.message : String(err));
        console.info('[AUTH] Catálogo local e navegação de capítulos funcionam normalmente.');
    }

    try {
        await init();
    } catch (err) {
        console.error('[INIT] ❌ Falha ao inicializar app', err);
        const message = err instanceof Error ? err.message : String(err);
        alert(`Falha ao inicializar aplicação: ${message}`);
    }
};

// Check if DOM is already loaded (because script is deferred)
if (document.readyState === 'loading') {
    console.log('[DOM] ⏳ DOM loading, waiting for event...');
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    console.log('[DOM] ✅ DOM already ready, initializing now...');
    startApp();
}
