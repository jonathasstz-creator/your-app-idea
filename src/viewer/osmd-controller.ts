
import { COLORS } from './constants';
import { clamp } from './utils';
import { computeSheetLayout, type SheetLayout, type MeasureWindow } from './sheet-layout';
import { SHEET_MOTION_CONFIG } from './sheet-motion-config';
import { type BeatToXEntry, interpolateBeatToX } from './beat-to-x-mapping';

const clamp01 = (v: number) => clamp(v, 0, 1);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const moveTowards = (current: number, target: number, maxDelta: number) => {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }
  if (current > target) {
    return Math.max(current - maxDelta, target);
  }
  return target;
};

const springCriticallyDamped = (
  x: number,
  v: number,
  target: number,
  freq: number,
  dt: number
) => {
  const omega = Math.max(0.0001, freq * 2 * Math.PI);
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const xNext = (f * x + dt * v + hhoo * target) * detInv;
  const vNext = (v + hoo * (target - x)) * detInv;
  return { x: xNext, v: vNext };
};

export class OsmdController {
  public osmd: any;
  private container: HTMLElement;
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private static readonly FALLBACK_CURSOR_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAABCAYAAAC2YQwdAAAAUUlEQVR4AbSOsQmAMBAAwYEsHMHCOcQ5gtwWEpxDnEN+ALGwEAlfpEiRJnx2SHHt3XWaFUnCGQ929ayfY3lnpmdkuPsmmNsa/A4fttqWdGEvBQAA//9Z0gx+AAAABklEQVQDAFSGSz+yXi9aAAAAAElFTkSuQmCC";
  private hasLoadedSheet: boolean = false;

  // Estado de zoom e layout
  private sheetZoom: number = 1.2;
  private currentMeasureWindow: MeasureWindow = { startMeasure: 0, endMeasure: 0 };
  private layoutCache: SheetLayout | null = null;
  private renderDebounceTimer: number | null = null;
  private lastUpdateMeasure: number = -1;

  // Cinematic camera state
  private sheetViewport: HTMLElement | null = null;
  private sheetInner: HTMLElement | null = null;
  private motionFrame: number | null = null;
  private lastFrameTime: number = 0;
  private cameraX: number = 0;
  private cameraVelocity: number = 0;
  private visualCursorX: number = 0;
  private cursorVelocity: number = 0;
  private cursorTargetX: number = 0;
  private userOverrideUntil: number = 0;
  private viewportWidth: number = 0;
  private lastCursorScreenX: number = 0;
  private wheelHandler = () => this.handleUserOverride();
  private pointerHandler = () => this.handleUserOverride();

  // Film mode (TIME_FILM) state
  private filmModeActive: boolean = false;
  private filmPixelsPerBeat: number = 90;
  private filmBaseOffsetPx: number = SHEET_MOTION_CONFIG.SWEET_SPOT_X;
  private lastFilmBeat: number = 0;
  private beatToXSource: "v1" | "v2" | null = null;
  private lastFilmLogTime: number = 0;
  private filmRefreshInFlight: boolean = false;

  // PHASE 3: Beat→X mapping for non-linear scroll
  private beatToXMapping: BeatToXEntry[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.createOsmdInstance();
    this.setupObservers();
    this.refreshDomRefs();
    this.startMotionLoop();
  }

  /**
   * Cleanly destroy observers, animation loop and DOM references.
   */
  destroy() {
    try {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.motionFrame !== null) {
        cancelAnimationFrame(this.motionFrame);
        this.motionFrame = null;
      }
      const viewport = this.getViewport();
      if (viewport) {
        viewport.removeEventListener('wheel', this.wheelHandler);
        viewport.removeEventListener('pointerdown', this.pointerHandler);
      }
      if (this.container) {
        this.container.innerHTML = '';
      }
    } catch (error) {
      console.warn('[OSMD] destroy failed', error);
    }
  }

  /**
   * Creates a new OSMD instance (called on init and after reset).
   */
  private createOsmdInstance() {
    // @ts-ignore
    this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.container, {
      backend: "svg",
      autoResize: false, // We handle it manually via ResizeObserver
      drawingParameters: "compact",
      drawPartNames: false,
      drawTitle: false,
      drawSubtitle: false,
      drawLyricist: false,
      drawComposer: false,
      drawMetronomeMarks: false,
      renderSingleHorizontalStaffline: true,
    });
    // @ts-ignore Initialize TransposeCalculator for visual transposition
    this.osmd.TransposeCalculator = new opensheetmusicdisplay.TransposeCalculator();
  }

  private getViewport(): HTMLElement | null {
    if (this.sheetViewport && document.body.contains(this.sheetViewport)) {
      return this.sheetViewport;
    }
    const viewport = this.container.closest('.sheet-viewport') as HTMLElement | null;
    this.sheetViewport = viewport;
    return viewport;
  }

  private refreshDomRefs() {
    this.sheetInner = this.container.parentElement;
    this.sheetViewport = this.getViewport();
    const viewport = this.sheetViewport;
    if (viewport) {
      this.attachUserOverrideListeners(viewport);
      this.updateViewportMetrics(viewport);
    }
    if (this.filmModeActive) {
      this.applyFilmTransform();
    } else {
      this.applyCameraTransform();
    }
  }

  private attachUserOverrideListeners(viewport: HTMLElement) {
    viewport.removeEventListener('wheel', this.wheelHandler);
    viewport.removeEventListener('pointerdown', this.pointerHandler);
    viewport.addEventListener('wheel', this.wheelHandler, { passive: true });
    viewport.addEventListener('pointerdown', this.pointerHandler, { passive: true });
  }

  private handleUserOverride() {
    this.userOverrideUntil = performance.now() + SHEET_MOTION_CONFIG.USER_OVERRIDE_MS;
  }

  private updateViewportMetrics(viewport?: HTMLElement) {
    const vp = viewport || this.getViewport();
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const width = vp.clientWidth || rect.width;
    if (width > 0) {
      this.viewportWidth = width;
    }
  }

  private resetMotionState(options?: { snapCamera?: boolean; resetSpring?: boolean; zeroVelocity?: boolean }) {
    const now = performance.now();
    this.lastFrameTime = now;
    if (options?.resetSpring) {
      this.visualCursorX = this.cursorTargetX;
      this.cursorVelocity = 0;
    }

    if (options?.zeroVelocity ?? false) {
      this.cameraVelocity = 0;
    }

    if (options?.snapCamera) {
      const anchor = Math.max(SHEET_MOTION_CONFIG.SWEET_SPOT_X, SHEET_MOTION_CONFIG.LIMIT_LEFT);
      this.cameraX = Math.max(0, this.visualCursorX - anchor);
      this.applyCameraTransform();
    }
  }

  private applyCameraTransform() {
    if (!this.sheetInner || this.filmModeActive) return;
    const x = -this.cameraX;
    this.sheetInner.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  /**
   * PHASE 3: Set beat→x mapping for non-linear scroll.
   */
  setBeatToXMapping(mapping: BeatToXEntry[], source?: "v1" | "v2") {
    this.beatToXMapping = mapping;
    if (source) {
      this.beatToXSource = source;
    }
    console.log(`[OsmdController] Beat→X mapping set: ${mapping.length} entries`);
  }

  private getScrollTargetX(beatNow: number, baseOffset: number, pxPerBeat: number): number {
    // FILM MODE: Continuous beat-based scrolling
    if (this.beatToXMapping.length > 0) {
      const noteX = interpolateBeatToX(beatNow, this.beatToXMapping);
      return baseOffset - noteX;
    }

    // FALLBACK: Linear calculation if no mapping exists
    return baseOffset - (beatNow * pxPerBeat);
  }

  private estimateDxPerBeatFromMapping(): number | null {
    const m = this.beatToXMapping;
    if (m.length < 2) return null;

    // Window of last mapping points to calculate median slope
    const k = Math.min(5, m.length - 1);
    const slopes: number[] = [];
    for (let i = m.length - 1; i > m.length - 1 - k; i--) {
      const p0 = m[i - 1], p1 = m[i];
      const db = p1.beat - p0.beat;
      if (db > 0.001) { // Avoid division by near-zero
        slopes.push((p1.x - p0.x) / db);
      }
    }
    if (slopes.length === 0) return null;
    slopes.sort((a, b) => a - b);
    return slopes[Math.floor(slopes.length / 2)];
  }

  private getScrollTargetXFilmV2(beatNow: number, baseOffset: number, pxPerBeat: number): number {
    if (this.beatToXMapping.length > 0) {
      const last = this.beatToXMapping[this.beatToXMapping.length - 1];
      if (beatNow > last.beat) {
        const dxPerBeat = this.estimateDxPerBeatFromMapping() ?? pxPerBeat;
        const noteX = last.x + ((beatNow - last.beat) * dxPerBeat);

        // Store estimated dx for logging
        (this as any)._lastEstimatedDx = dxPerBeat;

        return baseOffset - noteX;
      }
      const noteX = interpolateBeatToX(beatNow, this.beatToXMapping);
      return baseOffset - noteX;
    }
    return baseOffset - (beatNow * pxPerBeat);
  }

  private applyFilmTransform(beatNow?: number, options?: { pixelsPerBeat?: number; baseOffsetPx?: number }) {
    const beat = beatNow ?? this.lastFilmBeat;
    const baseOffset = options?.baseOffsetPx ?? this.filmBaseOffsetPx;
    const pxPerBeat = options?.pixelsPerBeat ?? this.filmPixelsPerBeat;
    const isV2Film = this.filmModeActive && this.beatToXSource === "v2";

    if (isV2Film && (!this.sheetInner || !this.sheetInner.isConnected)) {
      if (!this.filmRefreshInFlight) {
        this.filmRefreshInFlight = true;
        this.refreshDomRefs();
        this.filmRefreshInFlight = false;
      }
    }

    if (!this.sheetInner || (isV2Film && !this.sheetInner.isConnected)) {
      if (isV2Film) {
        console.warn('[OSMD_FILM] sheetInner not connected; transform skipped');
      }
      return;
    }

    if (isV2Film) {
      const prevFilmX = this.sheetInner.getAttribute('data-film-x');
      if (prevFilmX && !this.sheetInner.style.transform) {
        console.warn('[OSMD_FILM] Transform cleared externally', { prevFilmX });
      }
    }

    // Calculate target X
    const x = isV2Film
      ? this.getScrollTargetXFilmV2(beat, baseOffset, pxPerBeat)
      : this.getScrollTargetX(beat, baseOffset, pxPerBeat);

    if (isV2Film) {
      const now = performance.now();
      if (now - this.lastFilmLogTime >= 1000) {
        const lastMappedBeat = this.beatToXMapping.length > 0
          ? this.beatToXMapping[this.beatToXMapping.length - 1].beat
          : null;
        console.log('[OSMD_FILM_DEBUG]', {
          beatNow: Number(beat.toFixed(2)),
          x: Number(x.toFixed(1)),
          dxPerBeat: (this as any)._lastEstimatedDx ? Number((this as any)._lastEstimatedDx.toFixed(2)) : pxPerBeat,
          filmModeActive: this.filmModeActive,
          mappingLen: this.beatToXMapping.length,
          lastMappedBeat,
          sheetInnerConnected: Boolean(this.sheetInner?.isConnected),
          transform: this.sheetInner?.style.transform || "",
          dataFilmX: this.sheetInner?.getAttribute('data-film-x') || null,
        });
        this.lastFilmLogTime = now;
      }
    }

    // DEBUG: Monitor smoothness
    if (this.beatToXMapping.length > 0 && Math.random() < 0.01) {
      // Check diff against purely linear for debugging anomalies
      const linearX = baseOffset - (beat * pxPerBeat);
      const diff = Math.abs(x - linearX);
      console.log('[OSMD_FILM_SCROLL]', {
        beat: beat.toFixed(2),
        targetX: x.toFixed(1),
        diff: diff.toFixed(1),
        mode: 'FILM'
      });
    }

    // Apply transform
    this.sheetInner.style.transform = `translate3d(${x}px, 0, 0)`;
    this.sheetInner.style.willChange = "transform";
    // SENTINEL: verify it sticks
    this.sheetInner.setAttribute('data-film-x', String(x));
  }

  private applyCursorVisualOffset() {
    const cursor = this.osmd?.cursor;
    const el = cursor?.cursorElement || cursor?.CursorElement;
    if (!el) return;
    const offset = this.visualCursorX - this.cursorTargetX;
    el.style.transform = `translate3d(${offset.toFixed(3)}px, 0, 0)`;
    el.style.willChange = 'transform';
  }

  private updateCursorTargetFromDom(options?: { snapCamera?: boolean; resetSpring?: boolean }) {
    const cursor = this.osmd?.cursor;
    const el = cursor?.cursorElement || cursor?.CursorElement;
    const viewport = this.getViewport();
    if (!el || !viewport) return;

    const cursorRect = el.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const cursorScreenX = cursorRect.left - viewportRect.left;
    this.lastCursorScreenX = cursorScreenX;

    this.cursorTargetX = cursorScreenX + this.cameraX;

    this.resetMotionState({
      snapCamera: options?.snapCamera ?? false,
      resetSpring: options?.resetSpring ?? false,
      zeroVelocity: options?.snapCamera ?? false,
    });
    this.applyCursorVisualOffset();
  }

  private startMotionLoop() {
    if (this.motionFrame !== null) return;
    this.lastFrameTime = performance.now();
    const step = (time: number) => {
      const dtRaw = (time - this.lastFrameTime) / 1000;
      const dt = clamp(dtRaw, 0, SHEET_MOTION_CONFIG.MAX_DT);
      this.lastFrameTime = time;
      this.tickMotion(dt, time);
      this.motionFrame = requestAnimationFrame(step);
    };
    this.motionFrame = requestAnimationFrame(step);
  }

  private tickMotion(dt: number, now: number) {
    if (!this.sheetInner || !this.sheetViewport || this.viewportWidth <= 0) return;

    // FIX H3: In FILM mode, transport tick controls transform; RAF just updates viewport metrics
    if (this.filmModeActive) {
      // Only update metrics, don't apply transform (transport owns it)
      this.updateViewportMetrics();
      return;
    }

    // WAIT mode: spring-based camera logic
    const spring = springCriticallyDamped(
      this.visualCursorX,
      this.cursorVelocity,
      this.cursorTargetX,
      SHEET_MOTION_CONFIG.SPRING_FREQ,
      dt
    );
    this.visualCursorX = spring.x;
    this.cursorVelocity = spring.v;

    const currentScreenX = this.visualCursorX - this.cameraX;
    const limitRightX = this.viewportWidth * SHEET_MOTION_CONFIG.LIMIT_RIGHT_RATIO;

    let desiredVel = 0;
    const deadzoneEdge = SHEET_MOTION_CONFIG.SWEET_SPOT_X + SHEET_MOTION_CONFIG.DEADZONE;
    if (currentScreenX > deadzoneEdge) {
      const range = Math.max(1, limitRightX - deadzoneEdge);
      const stress = clamp01((currentScreenX - deadzoneEdge) / range);
      const s = smoothstep(stress);
      desiredVel = SHEET_MOTION_CONFIG.MAX_VELOCITY * Math.pow(s, 1.2);
    }

    if (now < this.userOverrideUntil) {
      desiredVel *= SHEET_MOTION_CONFIG.USER_OVERRIDE_REDUCTION;
    }

    const accelStep = SHEET_MOTION_CONFIG.ACCEL * dt;
    this.cameraVelocity = moveTowards(this.cameraVelocity, desiredVel, accelStep);
    this.cameraX += this.cameraVelocity * dt;

    if (currentScreenX > limitRightX) {
      const desiredCamera = this.visualCursorX - limitRightX;
      const t = clamp(SHEET_MOTION_CONFIG.CLAMP_SNAP_MULTIPLIER * dt, 0, 1);
      this.cameraX += (desiredCamera - this.cameraX) * t;
    } else if (currentScreenX < SHEET_MOTION_CONFIG.LIMIT_LEFT) {
      this.cameraX = this.visualCursorX - SHEET_MOTION_CONFIG.LIMIT_LEFT;
      if (this.cameraVelocity > 0) {
        this.cameraVelocity = Math.min(this.cameraVelocity, 30);
      }
    }

    if (this.cameraX < 0) this.cameraX = 0;

    this.applyCameraTransform();
    this.applyCursorVisualOffset();
  }

  /**
   * Deterministic reset: destroys OSMD instance, clears container, recreates everything.
   * This ensures no stale state is carried between lessons (MIDIano pattern).
   */
  async reset(): Promise<void> {
    console.log('[OSMD] Resetting deterministically...');

    // 1. Clean up observers
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 2. Clear render debounce
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }

    // 3. Clear container (remove all children including SVG)
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    // 4. Reset state
    this.layoutCache = null;
    this.currentMeasureWindow = { startMeasure: 0, endMeasure: 0 };
    this.lastUpdateMeasure = -1;
    this.hasLoadedSheet = false;
    this.cameraX = 0;
    this.cameraVelocity = 0;
    this.visualCursorX = 0;
    this.cursorVelocity = 0;
    this.cursorTargetX = 0;
    this.userOverrideUntil = 0;
    this.viewportWidth = 0;
    this.sheetViewport = null;
    this.sheetInner = null;

    // 5. OSMD instance is implicitly destroyed when container is cleared
    this.osmd = null as any;

    // 6. Recreate OSMD instance
    this.createOsmdInstance();

    // 7. Recreate observers
    this.setupObservers();
    this.refreshDomRefs();
    this.applyCameraTransform();
    this.resetMotionState({ resetSpring: true, snapCamera: true, zeroVelocity: true });

    console.log('[OSMD] Reset complete - instance recreated');
  }

  private setupObservers() {
    // Observa mudanças no container para capturar o SVG
    this.observer = new MutationObserver(() => {
      this.refreshDomRefs();
      this.applyColorsToSvg();
    });
    this.observer.observe(this.container, { childList: true, subtree: true });

    // Deterministic resize for the whole layout
    this.resizeObserver = new ResizeObserver(() => {
      this.handleContainerResize();
    });
    const viewport = this.getViewport();
    if (viewport) {
      this.resizeObserver.observe(viewport);
    } else if (this.container.parentElement) {
      this.resizeObserver.observe(this.container.parentElement);
    }
  }

  async load(xml: string) {
    this.hasLoadedSheet = false;
    try {
      await this.osmd.load(xml);

      const rules = this.osmd.rules;
      rules.DefaultColorNotehead = "#000000";
      rules.DefaultColorRest = "#000000";
      rules.DefaultColorStem = "#000000";
      rules.DefaultColorStaffLine = "#000000";
      rules.DefaultColorMeasureBarline = "#000000";
      rules.DefaultColorLabel = "#000000";
      rules.DefaultColorTitle = "#000000";
      rules.ColoringMode = 0;

      this.updateLayoutFromContainer();
      this.applyEngravingRules();
      this.hasLoadedSheet = true;

      await this.render();
    } catch (error) {
      this.hasLoadedSheet = false;
      throw error;
    }
  }

  async render() {
    if (!this.hasLoadedSheet) return;
    await this.osmd.render();
    this.osmd.cursor.show();
    this.applyColorsToSvg();
    this.refreshDomRefs();
    this.updateCursorTargetFromDom({ snapCamera: true, resetSpring: true });
  }

  private applyColorsToSvg() {
    const svg = this.container.querySelector('svg');
    if (!svg) return;

    const black = "#000000";
    svg.style.color = black;

    const elements = svg.querySelectorAll('path, line, rect, circle, ellipse, text');

    elements.forEach((el: any) => {
      const isCursor = el.classList.contains('osmd-cursor') ||
        el.getAttribute('class')?.includes('cursor') ||
        el.style.fill?.includes('rgb(0, 242, 255)') ||
        el.style.fill?.includes('rgb(0, 255, 136)') ||
        el.style.fill?.includes('rgb(255, 0, 85)') ||
        el.getAttribute('fill')?.toLowerCase() === COLORS.PRIMARY_NEON.toLowerCase();

      if (!isCursor) {
        if (el.tagName === 'line') {
          el.style.setProperty('stroke', black, 'important');
        } else if (el.tagName === 'text') {
          el.style.setProperty('fill', black, 'important');
        } else {
          const currentFill = el.getAttribute('fill');
          if (currentFill && currentFill !== 'none') el.style.setProperty('fill', black, 'important');
          const currentStroke = el.getAttribute('stroke');
          if (currentStroke && currentStroke !== 'none') el.style.setProperty('stroke', black, 'important');
          if (el.style.fill && el.style.fill !== 'none') el.style.setProperty('fill', black, 'important');
          if (el.style.stroke && el.style.stroke !== 'none') el.style.setProperty('stroke', black, 'important');
        }
        el.style.setProperty('opacity', '1', 'important');
      }
    });

    this.ensureCursorOnTop();
  }

  /**
   * OSMD injeta z-index inline negativo no cursor; reforçamos a camada aqui e via CSS.
   */
  private ensureCursorOnTop() {
    const cursors = this.container.querySelectorAll<HTMLImageElement>('[id^="cursorImg-"]');
    cursors.forEach((el) => {
      // Se o OSMD ou algum reset zerar o src, reatribui o fallback (cursor verde padrão)
      if (!el.src || el.src === "data:," || el.src === "data:") {
        el.src = OsmdController.FALLBACK_CURSOR_SRC;
      }

      el.style.setProperty('position', 'absolute', 'important');
      el.style.setProperty('z-index', '9999', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('max-height', 'none', 'important');

      // Reforço: respeitar atributos width/height do OSMD (evita height:auto global reduzir para 1px)
      const hAttr = el.getAttribute('height');
      const wAttr = el.getAttribute('width');
      if (hAttr) {
        const hNum = parseFloat(hAttr);
        if (!Number.isNaN(hNum)) el.style.setProperty('height', `${hNum}px`, 'important');
      }
      if (wAttr) {
        const wNum = parseFloat(wAttr);
        if (!Number.isNaN(wNum)) el.style.setProperty('width', `${wNum}px`, 'important');
      }
    });
  }

  jumpToPos(targetIndex: number, options?: { snapCamera?: boolean; resetSpring?: boolean }) {
    const cursor = this.osmd.cursor;
    if (!cursor) return;
    cursor.reset();
    for (let i = 0; i < targetIndex && !cursor.Iterator.EndReached; i++) {
      cursor.next();
    }
    cursor.show();
    this.applyColorsToSvg();
    this.ensureCursorOnTop();
    const snapCamera = options?.snapCamera ?? true;
    const resetSpring = options?.resetSpring ?? snapCamera;
    // Usar requestAnimationFrame para garantir que o cursor foi renderizado antes de scrollar
    requestAnimationFrame(() => {
      this.updateViewportMetrics();
      this.updateCursorTargetFromDom({ snapCamera, resetSpring });
      this.ensureCursorOnTop();
    });
  }

  setFilmMode(enabled: boolean, options?: { pixelsPerBeat?: number; baseOffsetPx?: number }) {
    this.filmModeActive = enabled;
    if (options?.pixelsPerBeat) {
      this.filmPixelsPerBeat = options.pixelsPerBeat;
    }
    if (options?.baseOffsetPx) {
      this.filmBaseOffsetPx = options.baseOffsetPx;
    }
    if (enabled) {
      this.cameraVelocity = 0;
      this.cursorVelocity = 0;
      this.cameraX = 0;
      this.visualCursorX = 0;
      this.lastFilmBeat = 0;
      const cursor = this.osmd?.cursor;
      const el = cursor?.cursorElement || cursor?.CursorElement;
      if (el) {
        el.style.transform = "";
      }
      this.applyFilmTransform(0, options);

      // DISABLE OSMD internal mechanism (if exists) or just warn
      console.log('[OSMD] FILM mode ON — internal updates DISABLED (managed by Transport)');
    } else {
      this.resetMotionState({ snapCamera: true, resetSpring: true, zeroVelocity: true });
      this.applyCameraTransform();
    }
  }

  // Linear update for TIME_FILM: move sheet by beat, independent of cursor index
  updateByBeatLinear(beatNow: number, options?: { pixelsPerBeat?: number; baseOffsetPx?: number }) {
    if (!Number.isFinite(beatNow)) return;
    this.filmModeActive = true;
    if (options?.pixelsPerBeat) this.filmPixelsPerBeat = options.pixelsPerBeat;
    if (options?.baseOffsetPx) this.filmBaseOffsetPx = options.baseOffsetPx;
    this.lastFilmBeat = beatNow;
    this.applyFilmTransform(beatNow, options);
  }

  /**
   * Move cursor to the note closest to the given beat (linear time progression).
   * This is for FILM mode where cursor should track time, not discrete steps.
   */
  moveCursorByBeat(beatNow: number, lessonNotes: Array<{ start_beat?: number; targetBeat?: number }>) {
    if (!this.osmd?.cursor || !lessonNotes || lessonNotes.length === 0) return;

    const cursor = this.osmd.cursor;

    // Find the index of the note closest to (but not exceeding) beatNow
    let targetIndex = 0;
    for (let i = 0; i < lessonNotes.length; i++) {
      const b = lessonNotes[i].start_beat ?? lessonNotes[i].targetBeat;
      if (typeof b === 'number' && b <= beatNow) {
        targetIndex = i;
      } else {
        break; // Notes are sorted, so we can stop
      }
    }

    // Move cursor to that position if it's different from current
    cursor.reset();
    for (let i = 0; i < targetIndex && !cursor.Iterator.EndReached; i++) {
      cursor.next();
    }
    cursor.show();
    this.ensureCursorOnTop();
  }

  updateByBeat(beatNow: number, options?: { pixelsPerBeat?: number; baseOffsetPx?: number }) {
    if (!Number.isFinite(beatNow) || !this.filmModeActive) return;
    if (options?.pixelsPerBeat) {
      this.filmPixelsPerBeat = options.pixelsPerBeat;
    }
    if (options?.baseOffsetPx) {
      this.filmBaseOffsetPx = options.baseOffsetPx;
    }
    this.lastFilmBeat = beatNow;
    this.filmModeActive = true;
    this.applyFilmTransform(beatNow, options);
  }

  updateCursorByBeat(_beatNow: number) {
    // Hook para mapeamento beat -> cursor (Jeito 2, opcional)
  }

  colorizeCursor(status: string) {
    const cursor = this.osmd.cursor;
    const el = cursor?.cursorElement || cursor?.CursorElement;
    if (!el) return;

    const s = status.toUpperCase();
    let color = COLORS.PRIMARY_NEON;
    if (s === "HIT") color = COLORS.HIT;
    if (s === "MISS") color = COLORS.MISS;

    el.style.setProperty('fill', color, 'important');
    el.style.setProperty('stroke', color, 'important');
    el.style.setProperty('filter', `drop-shadow(0 0 8px ${color})`, 'important');
    el.style.setProperty('opacity', '0.6', 'important');
  }

  setSheetZoom(value: number): void {
    this.sheetZoom = Math.max(0.5, Math.min(2.0, value));
    this.updateLayoutFromContainer();
    this.applyEngravingRules();
    this.scheduleRender();
  }

  /**
   * Visually transposes the sheet music without altering logical playback.
   * Accidentals and key signatures update in place.
   */
  async setTransposition(semitones: number): Promise<void> {
    if (!this.osmd?.Sheet) return;
    this.osmd.Sheet.Transpose = semitones;
    this.applyEngravingRules();
    await this.osmd.updateGraphic();
    await this.osmd.render();
    this.applyColorsToSvg();
    this.ensureCursorOnTop();
  }

  handleContainerResize(): void {
    if (!this.hasLoadedSheet) return;
    this.updateLayoutFromContainer();
    this.applyEngravingRules();
    this.updateViewportMetrics();
    this.updateCursorTargetFromDom({ snapCamera: true, resetSpring: true });
    this.scheduleRender();
  }

  private updateLayoutFromContainer(): void {
    const scrollContainer = this.getViewport() || this.container.parentElement;
    if (!scrollContainer) return;

    const containerWidth = scrollContainer.clientWidth;
    const containerHeight = scrollContainer.clientHeight;
    if (containerWidth === 0 || containerHeight === 0) return;

    this.layoutCache = computeSheetLayout(containerWidth, containerHeight, this.sheetZoom);
  }

  private applyEngravingRules(): void {
    if (!this.layoutCache) return;
    const rules = this.osmd.rules;
    if (rules.MinMeasureWidth !== undefined) {
      rules.MinMeasureWidth = this.layoutCache.minMeasureWidthPx;
    }
    this.osmd.Zoom = this.sheetZoom;
  }

  private scheduleRender(): void {
    if (!this.hasLoadedSheet) return;
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
    }

    this.renderDebounceTimer = window.setTimeout(async () => {
      try {
        await this.render();
      } catch (error) {
        console.error('[OSMD] Render failed', error);
      } finally {
        this.renderDebounceTimer = null;
      }
    }, 150);
  }

  checkTransformStability() {
    if (!this.filmModeActive || !this.sheetInner) return;

    // Note: getComputedStyle returns matrix(...), so direct string comparison might fail if we don't normalize.
    // However, if something else clears it, it might rely on style attribute.
    // Better check: does style attribute match what we set?
    const setX = this.sheetInner.getAttribute('data-film-x');
    if (!setX) return;

    // Just logging for now if we suspect issues.
    // Real check: if style.transform is empty but we expect it.
    if (!this.sheetInner.style.transform && this.filmModeActive) {
      console.warn('[OSMD] Transform cleared externally!');
    }
  }
}
