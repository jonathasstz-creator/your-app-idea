/**
 * Audio Service - Web Audio API for MIDI playback
 * Piano-like synthesis with layered oscillators and smooth ADSR envelope.
 */

export class AudioService {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeNotes: Map<number, { oscillators: OscillatorNode[]; gain: GainNode }> = new Map();
  private isEnabled: boolean = false;
  private volume: number = 0.3;
  private autoPlayFalling: boolean = false; // OFF by default — user must opt in

  async initialize(): Promise<boolean> {
    if (this.audioContext) return true;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) { console.warn("[AudioService] Web Audio API not supported"); return false; }

      this.audioContext = new Ctx();

      // Compressor to prevent clipping / harshness
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.15;
      this.compressor.connect(this.audioContext.destination);

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.compressor);

      console.log("[AudioService] Initialized");
      return true;
    } catch (e) {
      console.error("[AudioService] Init error:", e);
      return false;
    }
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) this.stopAllNotes();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  getVolume(): number { return this.volume; }
  getEnabled(): boolean { return this.isEnabled && this.audioContext !== null; }

  /** Whether falling notes auto-play audio when crossing the playhead */
  setAutoPlayFalling(on: boolean) { this.autoPlayFalling = on; }
  getAutoPlayFalling(): boolean { return this.autoPlayFalling; }

  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Play a MIDI note with a richer, piano-like tone.
   * Uses layered oscillators (fundamental + harmonics) with smooth ADSR.
   */
  async playMidiNote(midi: number, duration: number = 0.3, velocity: number = 100): Promise<void> {
    if (!this.isEnabled || !this.audioContext || !this.masterGain) return;

    // Re-trigger: stop previous instance of same note
    if (this.activeNotes.has(midi)) this.stopNote(midi);

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const freq = this.midiToFrequency(midi);

      // Velocity → gain (soft curve, max ~0.35 to leave headroom)
      const velNorm = (velocity / 127);
      const peakGain = velNorm * velNorm * 0.35; // quadratic for natural feel

      // Per-note gain envelope
      const noteGain = ctx.createGain();
      noteGain.connect(this.masterGain);

      // ADSR timings
      const attack = 0.008;
      const decay = 0.15;
      const sustainLevel = peakGain * 0.6;
      const releaseStart = Math.max(now + attack + decay, now + duration - 0.08);
      const releaseEnd = releaseStart + 0.08;

      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(peakGain, now + attack);
      noteGain.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.001), now + attack + decay);
      noteGain.gain.setValueAtTime(sustainLevel, releaseStart);
      noteGain.gain.exponentialRampToValueAtTime(0.001, releaseEnd);

      // --- Layered oscillators for richness ---
      const oscillators: OscillatorNode[] = [];

      // 1. Fundamental (triangle — warmer than sine, less harsh than sawtooth)
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.value = freq;
      const g1 = ctx.createGain();
      g1.gain.value = 1.0;
      osc1.connect(g1);
      g1.connect(noteGain);
      oscillators.push(osc1);

      // 2. Soft sine one octave up (adds brightness without harshness)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      osc2.connect(g2);
      g2.connect(noteGain);
      oscillators.push(osc2);

      // 3. Very soft sine at 3x (adds a bit of "bell" character)
      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.value = freq * 3;
      const g3 = ctx.createGain();
      g3.gain.value = 0.05;
      // Quick decay on this partial for piano-like attack transient
      g3.gain.setValueAtTime(0.08, now);
      g3.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc3.connect(g3);
      g3.connect(noteGain);
      oscillators.push(osc3);

      // Start all
      for (const osc of oscillators) {
        osc.start(now);
        osc.stop(releaseEnd + 0.01);
      }

      this.activeNotes.set(midi, { oscillators, gain: noteGain });

      // Cleanup on end
      oscillators[0].onended = () => {
        this.activeNotes.delete(midi);
        noteGain.disconnect();
      };
    } catch (e) {
      console.error(`[AudioService] playMidiNote ${midi} error:`, e);
    }
  }

  stopNote(midi: number): void {
    const entry = this.activeNotes.get(midi);
    if (entry && this.audioContext) {
      const now = this.audioContext.currentTime;
      // Quick fade-out to avoid click
      entry.gain.gain.cancelScheduledValues(now);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
      entry.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      for (const osc of entry.oscillators) {
        try { osc.stop(now + 0.04); } catch { /* already stopped */ }
      }
      this.activeNotes.delete(midi);
    }
  }

  stopAllNotes(): void {
    if (!this.audioContext) return;
    for (const [midi] of this.activeNotes) {
      this.stopNote(midi);
    }
    this.activeNotes.clear();
  }

  dispose(): void {
    this.stopAllNotes();
    this.setEnabled(false);
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.masterGain = null;
    this.compressor = null;
  }
}
