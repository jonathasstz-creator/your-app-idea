
export class LessonClock {
  private baseBeat: number = 0;       // Beat value at baseTime
  private baseTime: number = 0;       // performance.now() anchor
  private isRunning: boolean = false;
  private bpm: number = 120;

  constructor(bpm: number = 120) {
    this.bpm = bpm;
    this.reset();
  }

  setBpm(newBpm: number) {
    if (newBpm <= 0 || newBpm === this.bpm) return;

    // FIX H4: Anchor current beat before changing BPM (C0 continuity)
    const beatBefore = this.getBeatNow();
    const oldBpm = this.bpm;

    // Update BPM and re-anchor at same beat
    this.baseBeat = beatBefore;
    this.baseTime = performance.now();
    this.bpm = newBpm;

    const beatAfter = this.getBeatNow();
    const delta = Math.abs(beatAfter - beatBefore);

    // Log for verification (should be ~0)
    if (delta > 0.001) {
      console.warn('[BPM_CHANGE] Unexpected jump:', { beatBefore, beatAfter, delta, oldBpm, newBpm });
    }
  }

  play() {
    if (this.isRunning) return;
    // Anchor current beat when resuming
    this.baseBeat = this.getBeatNow();
    this.baseTime = performance.now();
    this.isRunning = true;
  }

  pause() {
    if (!this.isRunning) return;
    // Freeze beat value
    this.baseBeat = this.getBeatNow();
    this.baseTime = performance.now();
    this.isRunning = false;
  }

  reset() {
    this.baseBeat = 0;
    this.baseTime = performance.now();
    this.isRunning = false;
  }

  seekBeat(beat: number) {
    this.baseBeat = beat;
    this.baseTime = performance.now();
  }

  getBeatNow(): number {
    if (!this.isRunning) return this.baseBeat;

    const now = performance.now();
    const elapsedMs = now - this.baseTime;
    const msPerBeat = this.getMsPerBeat();
    const beatDelta = elapsedMs / msPerBeat;

    return this.baseBeat + beatDelta;
  }

  getMsPerBeat(): number {
    return 60000 / this.bpm;
  }

  isPlaying(): boolean {
    return this.isRunning;
  }
}
