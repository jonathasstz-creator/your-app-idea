
// Deprecated driver: now backed by SessionTimeline to keep API-compatible snapshot stream.
import { SessionTimeline, TimelineSnapshot } from "./session-timeline";

export type TransportStatus = "COUNTING" | "PLAYING" | "PAUSED" | "ENDED";

export interface TransportSnapshot extends TimelineSnapshot {
  transportBeat: number;
  exerciseBeat: number;
  beatsPerMeasure: number;
  countInBeats: number;
  status?: TransportStatus;
}

export class LocalTransportDriver {
  private timeline: SessionTimeline;
  private beatsPerMeasure = 4;
  private countInBeats = 4;
  private listeners: ((snapshot: TransportSnapshot) => void)[] = [];
  private rafId: number | null = null;
  // anti reentrância de emissão
  private isEmitting = false;
  private emitQueued = false;

  // Pause/Resume state
  private isPaused = false;
  private pausedAtBeat = 0;

  // DIAGNOSTIC: Slope measurement (FASE 0)
  private lastSlopeMeasurement = { beat: 0, time: 0, measureAt: 0 };

  constructor() {
    this.timeline = new SessionTimeline({ bpm: 120, countInBeats: this.countInBeats });
  }

  private resetSlopeBaseline(beat?: number, nowMs?: number) {
    const now = nowMs ?? performance.now();
    const beatValue = beat ?? this.timeline.snapshot().beatNow;
    this.lastSlopeMeasurement = { beat: beatValue, time: now, measureAt: now };
  }

  setConfig(config: { bpm: number; beatsPerMeasure: number; countInBeats: number }) {
    this.beatsPerMeasure = config.beatsPerMeasure || 4;
    this.countInBeats = config.countInBeats || 0;
    this.timeline.reset({ bpm: config.bpm, countInBeats: this.countInBeats });
    this.resetSlopeBaseline();
  }

  setBpm(newBpm: number) {
    if (newBpm <= 0 || !Number.isFinite(newBpm)) return;
    newBpm = Math.max(30, Math.min(240, newBpm));

    const nowMs = performance.now();
    const oldBpm =
      (this as any).bpm ??
      (this.timeline as any)?.bpm ??
      (this.timeline as any)?.config?.bpm ??
      60;

    // beat atual com bpm antigo
    const elapsedMs = nowMs - this.basePerfMs;
    const currentBeat = this.baseBeat + (elapsedMs / 60000) * oldBpm;

    // reancora
    this.baseBeat = currentBeat;
    this.basePerfMs = nowMs;

    (this as any).bpm = newBpm;

    const tl: any = this.timeline;
    if (tl && typeof tl.setBpm === "function") tl.setBpm(newBpm);
    else if (tl && typeof tl.reset === "function") tl.reset({ bpm: newBpm, countInBeats: this.countInBeats });
    else if (tl && typeof tl === "object") {
      if (tl.config) tl.config.bpm = newBpm;
      else tl.bpm = newBpm;
    }

    console.log('[BPM_CHANGE]', {
      old_bpm: oldBpm,
      new_bpm: newBpm,
      anchor_beat: currentBeat.toFixed(3),
      anchor_time_ms: nowMs.toFixed(0)
    });

    this.resetSlopeBaseline(currentBeat, nowMs);
  }

  setMode(mode: "WAIT" | "FILM") {
    if (mode === "WAIT") {
      this.reset(); // WAIT mode needs full reset
    }
  }

  start() {
    if (this.rafId !== null) return; // already running

    // Start fresh (not resume)
    this.isPaused = false;
    this.pausedAtBeat = 0;
    this.timeline.start();
    this.resetSlopeBaseline();

    const step = () => {
      this.emitSafe();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  pause() {
    if (this.rafId === null) return; // already stopped

    // Save current beat BEFORE pausing timeline
    const currentSnapshot = this.timeline.snapshot();
    this.pausedAtBeat = currentSnapshot.beatNow;

    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.timeline.pause();
    this.isPaused = true;
    this.resetSlopeBaseline(this.pausedAtBeat);

    console.log('[LocalTransportDriver.pause]', { pausedAtBeat: this.pausedAtBeat });
    queueMicrotask(() => this.emitSafe());
  }

  resume() {
    if (!this.isPaused) return; // not paused, nothing to resume
    if (this.rafId !== null) return; // already running

    // Resume from saved beat position
    this.timeline.resumeFrom(this.pausedAtBeat);
    this.isPaused = false;
    this.resetSlopeBaseline();

    const step = () => {
      this.emitSafe();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);

    console.log('[LocalTransportDriver.resume]', { resumedFromBeat: this.pausedAtBeat });
  }

  // Legacy alias for compatibility
  stop() {
    this.pause();
  }

  reset() {
    // Full reset: stop RAF, reset timeline to beat 0
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.timeline.reset({ countInBeats: this.countInBeats });
    this.isPaused = false;
    this.pausedAtBeat = 0;
    this.resetSlopeBaseline();

    console.log('[LocalTransportDriver.reset]');
    queueMicrotask(() => this.emitSafe());
  }

  isPlaying(): boolean {
    return this.rafId !== null;
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  onTick(callback: (snapshot: TransportSnapshot) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  // Always false because local timeline is self-consistent
  isStale(_ms: number) {
    return false;
  }

  private emitSafe() {
    if (this.isEmitting) {
      this.emitQueued = true;
      return;
    }
    this.isEmitting = true;
    try {
      this.emit();
    } finally {
      this.isEmitting = false;
      if (this.emitQueued) {
        this.emitQueued = false;
        queueMicrotask(() => this.emitSafe());
      }
    }
  }

  private emit() {
    const snap = this.timeline.snapshot();
    const beat = snap.beatNow;
    const status: TransportStatus = snap.isPlaying ? (beat < 0 ? "COUNTING" : "PLAYING") : "PAUSED";
    const transportSnap: TransportSnapshot = {
      ...snap,
      transportBeat: beat,
      exerciseBeat: Math.max(0, beat),
      beatsPerMeasure: this.beatsPerMeasure,
      countInBeats: this.countInBeats,
      status,
    };

    const now = performance.now();
    const last = this.lastSlopeMeasurement;

    // Gate slope check by status (PLAYING/COUNTING only)
    if (status !== "PLAYING" && status !== "COUNTING") {
      this.resetSlopeBaseline(beat, now);
    } else if (last && (last.time !== 0 || last.measureAt !== 0 || last.beat !== 0)) {
      if (now - last.measureAt > 500) {
        const deltaBeat = beat - last.beat;
        const deltaT = (now - last.time) / 1000; // seconds
        const expectedSlope = snap.bpm / 60; // quarter-beats per second if canonical
        const expectedDeltaBeat = expectedSlope * deltaT;
        const upperBound = expectedDeltaBeat * 2;
        const lowerBound = expectedDeltaBeat * 0.25;

        if (
          deltaT <= 0 ||
          deltaT > 1.0 ||
          Math.abs(deltaBeat) > upperBound ||
          (deltaT >= 0.35 && Math.abs(deltaBeat) < lowerBound)
        ) {
          this.resetSlopeBaseline(beat, now);
        } else {
          const slope = deltaT > 0 ? deltaBeat / deltaT : 0; // beats per second
          const ratio = expectedSlope > 0 ? slope / expectedSlope : 0;

          console.log('[SLOPE_CHECK]', {
            deltaBeat: deltaBeat.toFixed(3),
            deltaT_s: deltaT.toFixed(3),
            slope_measured: slope.toFixed(3),
            slope_expected: expectedSlope.toFixed(3),
            ratio: ratio.toFixed(3),
            bpm: snap.bpm,
            interpretation: Math.abs(ratio - 1.0) < 0.1 ? '✅ CANONICAL QUARTER' :
              Math.abs(ratio - 2.0) < 0.1 ? '⚠️ EIGHTH-BEAT SOURCE' :
                Math.abs(ratio - 0.5) < 0.1 ? '⚠️ HALF-BEAT SOURCE' : '❌ UNKNOWN'
          });

          this.lastSlopeMeasurement = { beat, time: now, measureAt: now };
        }
      }
    } else {
      this.resetSlopeBaseline(beat, now);
    }

    this.listeners.forEach((cb) => cb(transportSnap));
  }
}
