export type TimelinePhase = "count-in" | "playing" | "paused" | "stopped";

export interface TimelineConfig {
  bpm: number;
  countInBeats: number;
}

export interface TimelineSnapshot {
  nowMs: number;
  beatNow: number;
  bpm: number;
  phase: TimelinePhase;
  isPlaying: boolean;
}

// SessionTimeline: fonte única de tempo (ms) ancorada em session_start (t0)
export class SessionTimeline {
  private bpm: number;
  private countInBeats: number;
  private t0Ms: number = performance.now();
  private pausedAccumMs = 0;
  private lastPauseMs: number | null = null;
  private playing = false;
  private lastSnapshot: TimelineSnapshot | null = null;

  constructor(config: TimelineConfig) {
    this.bpm = Math.max(1, config.bpm);
    this.countInBeats = Math.max(0, config.countInBeats);
    this.t0Ms = performance.now();
  }

  reset(config?: Partial<TimelineConfig>) {
    if (config?.bpm !== undefined) this.bpm = Math.max(1, config.bpm);
    if (config?.countInBeats !== undefined) this.countInBeats = Math.max(0, config.countInBeats);
    this.t0Ms = performance.now();
    this.pausedAccumMs = 0;
    this.lastPauseMs = null;
    this.playing = false;
    this.lastSnapshot = null;
  }

  start() {
    this.t0Ms = performance.now();
    this.pausedAccumMs = 0;
    this.lastPauseMs = null;
    this.playing = true;
    return this.snapshot();
  }

  pause() {
    if (!this.playing || this.lastPauseMs !== null) return this.snapshot();
    this.lastPauseMs = performance.now();
    this.playing = false;
    return this.snapshot();
  }

  resume() {
    if (this.playing) return this.snapshot();
    const now = performance.now();
    if (this.lastPauseMs !== null) {
      this.pausedAccumMs += now - this.lastPauseMs;
    }
    this.lastPauseMs = null;
    this.playing = true;
    return this.snapshot();
  }

  /**
   * Resume from a specific beat position (for pause/resume feature).
   * Calculates new t0Ms to make beatNow() == targetBeat.
   */
  resumeFrom(targetBeat: number) {
    const now = performance.now();

    // Calculate elapsed time from beat 0 to targetBeat
    // beatNow = ((activeMs / 60000) * bpm) - countInBeats
    // => (beatNow + countInBeats) = (activeMs / 60000) * bpm
    // => activeMs = (beatNow + countInBeats) * 60000 / bpm
    const activeMs = (targetBeat + this.countInBeats) * 60000 / this.bpm;

    // Set t0 such that: now - t0 = activeMs
    // => t0 = now - activeMs
    this.t0Ms = now - activeMs;
    this.pausedAccumMs = 0;
    this.lastPauseMs = null;
    this.playing = true;

    console.log('[SessionTimeline.resumeFrom]', {
      targetBeat,
      activeMs,
      newT0Ms: this.t0Ms,
      checkBeatNow: this.beatNow(),
    });

    return this.snapshot();
  }

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm) || bpm <= 0) return this.snapshot();

    // FIX: Preserve beat position across BPM changes
    const beatBefore = this.beatNow();
    const oldBpm = this.bpm;

    // Calculate new t0 that preserves current beat
    // beat = (nowMs / 60000) * bpm - countInBeats
    // nowMs = (beat + countInBeats) * 60000 / bpm
    const targetMs = (beatBefore + this.countInBeats) * 60000 / bpm;
    const now = performance.now();
    const pausedTotal = this.lastPauseMs !== null
      ? this.pausedAccumMs + (now - this.lastPauseMs)
      : this.pausedAccumMs;

    // Re-anchor t0 so that nowMs() returns targetMs
    this.t0Ms = now - targetMs - pausedTotal;
    this.bpm = bpm;

    // Verify continuity
    const beatAfter = this.beatNow();
    const delta = Math.abs(beatAfter - beatBefore);
    if (delta > 0.001) {
      console.warn('[SessionTimeline.setBpm] Unexpected jump:', {
        beatBefore, beatAfter, delta, oldBpm, newBpm: bpm
      });
    }

    return this.snapshot();
  }

  nowMs(): number {
    const now = performance.now();
    const paused = this.lastPauseMs !== null ? now - this.lastPauseMs : 0;
    const pausedTotal = this.pausedAccumMs + paused;
    return now - this.t0Ms - pausedTotal;
  }

  beatNow(): number {
    const ms = this.nowMs();
    const beat = (ms / 60000) * this.bpm;
    // count-in: beat negativo até atingir 0
    return beat - this.countInBeats;
  }

  snapshot(): TimelineSnapshot {
    const snap: TimelineSnapshot = {
      nowMs: this.nowMs(),
      beatNow: this.beatNow(),
      bpm: this.bpm,
      phase: this.playing ? (this.beatNow() < 0 ? "count-in" : "playing") : "paused",
      isPlaying: this.playing,
    };
    this.lastSnapshot = snap;
    return snap;
  }
}
