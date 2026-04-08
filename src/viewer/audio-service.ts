/**
 * Audio Service — Premium Piano Synthesis
 *
 * Multi-partial additive synthesis with:
 *  - 8 harmonics with register-dependent amplitude & decay
 *  - Hammer strike transient (noise burst)
 *  - Sympathetic string resonance (subtle detuned partials)
 *  - Per-register EQ (low warm, mid balanced, high bright)
 *  - Realistic sustain + damper release envelope
 *  - Stereo widening via subtle per-partial pan
 */

/** Harmonic partial definition */
interface Partial {
  ratio: number;   // frequency multiplier
  amp: number;     // relative amplitude (0-1)
  decay: number;   // decay time multiplier (higher = longer)
  type: OscillatorType;
}

/** Register-dependent tonal profile */
interface RegisterProfile {
  partials: Partial[];
  attackTime: number;
  decayBase: number;
  sustainLevel: number;
  brightness: number;   // high-shelf gain modifier
  hammerGain: number;    // noise transient volume
}

function getRegisterProfile(midi: number): RegisterProfile {
  if (midi < 40) {
    // Bass register — warm, long sustain, strong fundamentals
    return {
      partials: [
        { ratio: 1,   amp: 1.0,  decay: 1.0,  type: 'sine' },
        { ratio: 2,   amp: 0.6,  decay: 0.85, type: 'sine' },
        { ratio: 3,   amp: 0.25, decay: 0.7,  type: 'sine' },
        { ratio: 4,   amp: 0.12, decay: 0.5,  type: 'sine' },
        { ratio: 5,   amp: 0.06, decay: 0.35, type: 'sine' },
        { ratio: 6,   amp: 0.03, decay: 0.25, type: 'sine' },
        { ratio: 0.5, amp: 0.08, decay: 1.2,  type: 'sine' }, // sub-harmonic warmth
      ],
      attackTime: 0.005,
      decayBase: 3.5,
      sustainLevel: 0.35,
      brightness: 0.6,
      hammerGain: 0.04,
    };
  } else if (midi < 60) {
    // Low-mid register — rich, balanced
    return {
      partials: [
        { ratio: 1,   amp: 1.0,  decay: 1.0,  type: 'sine' },
        { ratio: 2,   amp: 0.55, decay: 0.8,  type: 'sine' },
        { ratio: 3,   amp: 0.3,  decay: 0.6,  type: 'sine' },
        { ratio: 4,   amp: 0.15, decay: 0.45, type: 'sine' },
        { ratio: 5,   amp: 0.08, decay: 0.3,  type: 'sine' },
        { ratio: 6,   amp: 0.04, decay: 0.2,  type: 'sine' },
        { ratio: 7,   amp: 0.02, decay: 0.15, type: 'sine' },
      ],
      attackTime: 0.004,
      decayBase: 2.8,
      sustainLevel: 0.25,
      brightness: 0.8,
      hammerGain: 0.06,
    };
  } else if (midi < 80) {
    // Mid register (C4-G5) — most expressive, clear
    return {
      partials: [
        { ratio: 1,   amp: 1.0,  decay: 1.0,  type: 'sine' },
        { ratio: 2,   amp: 0.45, decay: 0.75, type: 'sine' },
        { ratio: 3,   amp: 0.22, decay: 0.55, type: 'sine' },
        { ratio: 4,   amp: 0.12, decay: 0.4,  type: 'sine' },
        { ratio: 5,   amp: 0.07, decay: 0.28, type: 'sine' },
        { ratio: 6,   amp: 0.04, decay: 0.18, type: 'sine' },
        { ratio: 7,   amp: 0.02, decay: 0.12, type: 'sine' },
        { ratio: 8,   amp: 0.01, decay: 0.08, type: 'sine' },
      ],
      attackTime: 0.003,
      decayBase: 2.2,
      sustainLevel: 0.18,
      brightness: 1.0,
      hammerGain: 0.08,
    };
  } else {
    // High register — bright, short decay, bell-like
    return {
      partials: [
        { ratio: 1,   amp: 1.0,  decay: 1.0,  type: 'sine' },
        { ratio: 2,   amp: 0.35, decay: 0.6,  type: 'sine' },
        { ratio: 3,   amp: 0.15, decay: 0.35, type: 'sine' },
        { ratio: 4,   amp: 0.08, decay: 0.2,  type: 'sine' },
        { ratio: 5,   amp: 0.04, decay: 0.12, type: 'sine' },
      ],
      attackTime: 0.002,
      decayBase: 1.2,
      sustainLevel: 0.08,
      brightness: 1.3,
      hammerGain: 0.10,
    };
  }
}

interface ActiveNote {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  noteGain: GainNode;
  hammerSource?: AudioBufferSourceNode;
  panner?: StereoPannerNode;
}

export class AudioService {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private activeNotes: Map<number, ActiveNote> = new Map();
  private isEnabled: boolean = false;
  private volume: number = 0.3;
  private autoPlayFalling: boolean = false;
  private hammerBuffer: AudioBuffer | null = null;

  async initialize(): Promise<boolean> {
    if (this.audioContext) return true;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) { console.warn("[AudioService] Web Audio API not supported"); return false; }

      this.audioContext = new Ctx();
      const ctx = this.audioContext;

      // Compressor — gentle, musical limiting
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.compressor.connect(ctx.destination);

      // Dry/wet reverb mix
      this.dryGain = ctx.createGain();
      this.dryGain.gain.value = 0.82;
      this.dryGain.connect(this.compressor);

      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.18;
      this.reverbGain.connect(this.compressor);

      // Algorithmic reverb (impulse response from noise)
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this.createReverbImpulse(ctx, 1.8, 3.0);
      this.convolver.connect(this.reverbGain);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.volume;
      // Master feeds both dry and reverb
      this.masterGain.connect(this.dryGain);
      this.masterGain.connect(this.convolver);

      // Pre-generate hammer noise buffer
      this.hammerBuffer = this.createHammerNoise(ctx);

      console.log("[AudioService] Premium piano initialized");
      return true;
    } catch (e) {
      console.error("[AudioService] Init error:", e);
      return false;
    }
  }

  /** Create a synthetic reverb impulse response */
  private createReverbImpulse(ctx: AudioContext, duration: number, decayRate: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        // Exponential decay with random noise
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decayRate);
      }
    }
    return buffer;
  }

  /** Create a short noise burst simulating hammer strike */
  private createHammerNoise(ctx: AudioContext): AudioBuffer {
    const duration = 0.012; // 12ms
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Sharp attack, quick decay noise
      const envelope = t < 0.1 ? t / 0.1 : Math.exp(-(t - 0.1) * 8);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    return buffer;
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

  setAutoPlayFalling(on: boolean) { this.autoPlayFalling = on; }
  getAutoPlayFalling(): boolean { return this.autoPlayFalling; }

  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /** Stereo position based on MIDI note (low=left, high=right, like a real piano) */
  private midiToPan(midi: number): number {
    // MIDI 21 (A0) → -0.6, MIDI 108 (C8) → 0.6
    return ((midi - 64) / 44) * 0.6;
  }

  /**
   * Premium piano note synthesis.
   * Multi-partial additive synthesis with hammer transient,
   * register-dependent timbre, and natural decay.
   */
  async playMidiNote(midi: number, duration: number = 0.3, velocity: number = 100): Promise<void> {
    if (!this.isEnabled || !this.audioContext || !this.masterGain) return;

    // Re-trigger: stop previous instance
    if (this.activeNotes.has(midi)) this.stopNote(midi);

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const freq = this.midiToFrequency(midi);
      const profile = getRegisterProfile(midi);

      // Velocity curve — cubic for expressive dynamics
      const velNorm = velocity / 127;
      const velCurve = velNorm * velNorm * velNorm;
      const peakGain = 0.12 + velCurve * 0.28; // range: 0.12 – 0.40

      // Stereo panner
      let panner: StereoPannerNode | undefined;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.value = this.midiToPan(midi);
        panner.connect(this.masterGain);
      }
      const destination = panner || this.masterGain;

      // Master note gain
      const noteGain = ctx.createGain();
      noteGain.connect(destination);

      // Initial envelope on noteGain
      const attackEnd = now + profile.attackTime;
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(peakGain, attackEnd);

      // Decay to sustain
      const decayTime = profile.decayBase * (0.5 + 0.5 * velNorm);
      const sustainGain = Math.max(peakGain * profile.sustainLevel, 0.001);
      noteGain.gain.setTargetAtTime(sustainGain, attackEnd, decayTime / 3);

      // Schedule final release
      const totalDuration = Math.max(duration, profile.decayBase * 0.8);
      const releaseStart = now + totalDuration;
      const releaseTime = 0.15;
      noteGain.gain.setTargetAtTime(0.0001, releaseStart, releaseTime / 5);

      const stopTime = releaseStart + releaseTime + 0.05;

      // --- Harmonic partials ---
      const oscillators: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      for (const partial of profile.partials) {
        const osc = ctx.createOscillator();
        osc.type = partial.type;
        const partialFreq = freq * partial.ratio;

        // Slight inharmonicity (real piano strings are slightly sharp on upper partials)
        const inharmonicity = 1 + (partial.ratio - 1) * (partial.ratio - 1) * 0.0002;
        osc.frequency.value = partialFreq * inharmonicity;

        // Per-partial gain with independent decay
        const g = ctx.createGain();
        const partialPeak = partial.amp * (0.7 + 0.3 * velNorm);
        g.gain.setValueAtTime(partialPeak, now);

        // Higher partials decay faster (natural piano behavior)
        const partialDecay = decayTime * partial.decay;
        const partialSustain = Math.max(partialPeak * 0.05, 0.0001);
        g.gain.setTargetAtTime(partialSustain, attackEnd, partialDecay / 3);

        osc.connect(g);
        g.connect(noteGain);

        osc.start(now);
        osc.stop(stopTime);

        oscillators.push(osc);
        gains.push(g);
      }

      // --- Hammer strike transient ---
      let hammerSource: AudioBufferSourceNode | undefined;
      if (this.hammerBuffer && profile.hammerGain > 0) {
        hammerSource = ctx.createBufferSource();
        hammerSource.buffer = this.hammerBuffer;

        // Bandpass filter shaped by register
        const hammerFilter = ctx.createBiquadFilter();
        hammerFilter.type = 'bandpass';
        hammerFilter.frequency.value = Math.min(freq * 4, 8000);
        hammerFilter.Q.value = 1.5;

        const hammerGain = ctx.createGain();
        hammerGain.gain.value = profile.hammerGain * velCurve;

        hammerSource.connect(hammerFilter);
        hammerFilter.connect(hammerGain);
        hammerGain.connect(noteGain);

        hammerSource.start(now);
      }

      // --- Sympathetic resonance (very subtle detuned partial) ---
      const sympOsc = ctx.createOscillator();
      sympOsc.type = 'sine';
      sympOsc.frequency.value = freq * 1.001; // ~1.7 cents sharp
      const sympGain = ctx.createGain();
      sympGain.gain.setValueAtTime(0.02 * velNorm, now);
      sympGain.gain.setTargetAtTime(0.001, now + 0.3, 0.8);
      sympOsc.connect(sympGain);
      sympGain.connect(noteGain);
      sympOsc.start(now);
      sympOsc.stop(stopTime);
      oscillators.push(sympOsc);
      gains.push(sympGain);

      this.activeNotes.set(midi, { oscillators, gains, noteGain, hammerSource, panner });

      // Cleanup on end
      oscillators[0].onended = () => {
        this.activeNotes.delete(midi);
        try { noteGain.disconnect(); } catch {}
        if (panner) try { panner.disconnect(); } catch {}
      };
    } catch (e) {
      console.error(`[AudioService] playMidiNote ${midi} error:`, e);
    }
  }

  stopNote(midi: number): void {
    const entry = this.activeNotes.get(midi);
    if (entry && this.audioContext) {
      const now = this.audioContext.currentTime;
      // Damper release — quick but smooth fade
      const releaseTime = 0.06;
      entry.noteGain.gain.cancelScheduledValues(now);
      entry.noteGain.gain.setValueAtTime(
        Math.max(entry.noteGain.gain.value, 0.0001), now
      );
      entry.noteGain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

      for (const osc of entry.oscillators) {
        try { osc.stop(now + releaseTime + 0.02); } catch { /* already stopped */ }
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
    this.convolver = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.hammerBuffer = null;
  }
}
