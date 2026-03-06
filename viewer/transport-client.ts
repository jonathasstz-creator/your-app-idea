export type TransportStatus = "COUNTING" | "PLAYING" | "PAUSED";

export enum PracticeMode {
  WAIT_INPUT = "WAIT_INPUT",
  TIME_FILM = "TIME_FILM",
}

export interface TransportPayload {
  status?: TransportStatus;
  bpm?: number;
  beats_per_measure?: number;
  count_in_beats?: number;
  transport_beat?: number;
  exercise_beat?: number;
  server_seq?: number;
  server_sent_at_mono?: number;
}

export interface TransportSnapshot {
  beatNow: number;
  transportBeat: number;
  exerciseBeat: number;
  bpm: number;
  beatsPerMeasure: number;
  countInBeats: number;
  status: TransportStatus;
  lastServerBeat: number | null;
  lastRecvPerfMs: number | null;
  driftMs: number;
  serverSeq?: number;
  serverSentAtMono?: number;
  staleMs: number | null;
}

type TickListener = (snapshot: TransportSnapshot) => void;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export class TransportClient {
  private mode: PracticeMode = PracticeMode.WAIT_INPUT;
  private bpm: number = 120;
  private beatsPerMeasure: number = 4;
  private countInBeats: number = 12;
  private status: TransportStatus = "COUNTING";
  private beatNow: number = 0;
  private lastFramePerfMs: number | null = null;
  private lastServerBeat: number | null = null;
  private lastRecvPerfMs: number | null = null;
  private driftDebugMs: number = 0;
  private speedBias: number = 0;
  private readonly alphaPos: number;
  private readonly alphaVel: number;
  private readonly maxSpeedBias: number = 0.08;
  private readonly maxDt: number = 0.05;
  private rafId: number | null = null;
  private listeners: Set<TickListener> = new Set();
  private serverSeq?: number;
  private serverSentAtMono?: number;

  constructor() {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.alphaPos = prefersReducedMotion ? 0.06 : 0.12;
    this.alphaVel = prefersReducedMotion ? 0.0 : 0.04;
  }

  setMode(mode: PracticeMode) {
    this.mode = mode;
  }

  setBpm(value: number) {
    if (Number.isFinite(value) && value > 0) {
      this.bpm = value;
    }
  }

  start() {
    if (this.rafId !== null) return;
    this.lastFramePerfMs = performance.now();
    const step = (now: number) => {
      this.integrate(now);
      this.emit();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  onTick(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onServerTransportUpdate(payload: TransportPayload) {
    if (!payload) return;
    const now = performance.now();
    this.integrate(now);

    if (Number.isFinite(payload.bpm) && (payload.bpm as number) > 0) {
      this.bpm = payload.bpm as number;
    }
    if (Number.isFinite(payload.beats_per_measure) && (payload.beats_per_measure as number) > 0) {
      this.beatsPerMeasure = payload.beats_per_measure as number;
    }
    if (Number.isFinite(payload.count_in_beats) && (payload.count_in_beats as number) >= 0) {
      this.countInBeats = payload.count_in_beats as number;
    }
    if (payload.status) {
      this.status = payload.status;
    }

    const serverBeat = Number.isFinite(payload.transport_beat)
      ? (payload.transport_beat as number)
      : Number.isFinite(payload.exercise_beat)
        ? (payload.exercise_beat as number) + this.countInBeats
        : null;

    if (serverBeat !== null) {
      if (this.lastServerBeat === null) {
        this.beatNow = serverBeat;
      }
      const errorBeats = serverBeat - this.beatNow;
      // Drift Correction Fix: Less aggressive jump
      // increased threshold to 2.0 (from 1.0) and reduced factor to 0.2 (from 0.5)
      if (Math.abs(errorBeats) > 2.0) {
        this.beatNow = this.beatNow + errorBeats * 0.2;
        this.speedBias = 0;
      } else {
        this.beatNow += errorBeats * this.alphaPos;
        if (this.alphaVel > 0) {
          this.speedBias = clamp(this.speedBias + errorBeats * this.alphaVel, -this.maxSpeedBias, this.maxSpeedBias);
        }
      }
      this.lastServerBeat = serverBeat;
      this.lastRecvPerfMs = now;
      this.serverSeq = payload.server_seq;
      this.serverSentAtMono = payload.server_sent_at_mono;
      this.driftDebugMs = this.beatErrorToMs(errorBeats);
    }
  }

  getSnapshot(): TransportSnapshot {
    const exerciseBeat = Math.max(0, this.beatNow - this.countInBeats);
    return {
      beatNow: this.beatNow,
      transportBeat: this.beatNow,
      exerciseBeat,
      bpm: this.bpm,
      beatsPerMeasure: this.beatsPerMeasure,
      countInBeats: this.countInBeats,
      status: this.status,
      lastServerBeat: this.lastServerBeat,
      lastRecvPerfMs: this.lastRecvPerfMs,
      driftMs: this.driftDebugMs,
      serverSeq: this.serverSeq,
      serverSentAtMono: this.serverSentAtMono,
      staleMs: this.getStaleMs(),
    };
  }

  isStale(thresholdMs: number): boolean {
    const stale = this.getStaleMs();
    if (stale === null) return false;
    return stale > thresholdMs;
  }

  private integrate(now: number) {
    if (this.lastFramePerfMs === null) {
      this.lastFramePerfMs = now;
      return;
    }
    const dt = clamp((now - this.lastFramePerfMs) / 1000, 0, this.maxDt);
    this.lastFramePerfMs = now;
    if (this.status === "PAUSED") return;
    const rate = (this.bpm / 60) * (1 + this.speedBias);
    if (Number.isFinite(rate) && rate > 0) {
      this.beatNow += dt * rate;
    }
  }

  private emit() {
    if (this.mode !== PracticeMode.TIME_FILM) return;
    const snapshot = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snapshot));
  }

  private getStaleMs(): number | null {
    if (!this.lastRecvPerfMs) return null;
    return performance.now() - this.lastRecvPerfMs;
  }

  private beatErrorToMs(errorBeats: number): number {
    const secondsPerBeat = 60 / Math.max(1, this.bpm);
    return errorBeats * secondsPerBeat * 1000;
  }
}
