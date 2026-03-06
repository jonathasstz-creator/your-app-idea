
export interface MetronomeState {
  bpm: number;
  transportBeat: number;
  beatsPerMeasure: number;
  countInBeats: number;
  status: string;
}

export class TransportMetronome {
  private audioCtx: AudioContext | null = null;
  private enabled = true;
  private timerId: number | null = null;
  private lookaheadMs = 80;
  private scheduleAheadSec = 0.2;
  private nextClickBeat = 0;
  private lastSnapshot: MetronomeState | null = null;
  private lastBpm: number | null = null;

  constructor(private accentHz: number = 880, private beatHz: number = 660) {}

  async setEnabled(enabled: boolean) {
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    } else if (!wasEnabled && this.lastSnapshot && this.timerId === null) {
      // Se acabamos de habilitar e temos um snapshot válido, inicia o scheduling imediatamente
      if (!this.audioCtx) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        if (Ctor) {
          this.audioCtx = new Ctor();
        }
      }
      if (this.audioCtx) {
        // Resume AudioContext se estiver suspenso (política de autoplay)
        if (this.audioCtx.state === "suspended") {
          try {
            await this.audioCtx.resume();
          } catch {
            // Ignora erro se não conseguir resumir
          }
        }
        this.timerId = window.setTimeout(() => this.scheduleLoop(), this.lookaheadMs);
      }
    }
  }

  async sync(snapshot: MetronomeState) {
    this.lastSnapshot = snapshot;
    const bpmChanged = this.lastBpm !== null && this.lastBpm !== snapshot.bpm;
    this.lastBpm = snapshot.bpm;
    this.nextClickBeat = Math.max(this.nextClickBeat, Math.floor(snapshot.transportBeat) + 1);
    if (bpmChanged) {
      // Reseta agendamento para evitar "travar" no tempo anterior
      this.reset(snapshot.transportBeat);
    }
    if (!this.enabled) return;
    if (!this.audioCtx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctor) return;
      this.audioCtx = new Ctor();
    }
    // Resume AudioContext se estiver suspenso (política de autoplay)
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {
        // Ignora erro se não conseguir resumir
      }
    }
    if (this.timerId === null) {
      this.timerId = window.setTimeout(() => this.scheduleLoop(), this.lookaheadMs);
    }
  }

  stop() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    // Limpa o lastSnapshot para garantir que não usemos dados stale após reset
    this.lastSnapshot = null;
  }

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.lastBpm = bpm;
    if (this.lastSnapshot) {
      this.lastSnapshot = { ...this.lastSnapshot, bpm };
    }
    // Se já houver clicks agendados, recomeçar a partir do beat atual conhecido
    if (this.lastSnapshot) {
      this.reset(this.lastSnapshot.transportBeat);
    }
  }

  reset(beatNow: number = 0) {
    this.nextClickBeat = Math.floor(beatNow) + 1;
  }

  private scheduleLoop() {
    this.timerId = null;
    if (!this.enabled || !this.audioCtx || !this.lastSnapshot) return;
    const snap = this.lastSnapshot;
    if (snap.status === "PAUSED") {
      this.timerId = window.setTimeout(() => this.scheduleLoop(), this.lookaheadMs);
      return;
    }

    const secPerBeat = 60 / Math.max(1, snap.bpm);
    const beatNow = snap.transportBeat;
    const horizonBeats = this.scheduleAheadSec / secPerBeat;
    const audioNow = this.audioCtx.currentTime;
    while (this.nextClickBeat <= beatNow + horizonBeats) {
      const beatDiff = this.nextClickBeat - beatNow;
      const time = audioNow + Math.max(0, beatDiff * secPerBeat);
      const beatIndex = Math.max(0, this.nextClickBeat - snap.countInBeats);
      const beatInMeasure =
        snap.beatsPerMeasure > 0 ? ((beatIndex % snap.beatsPerMeasure) + snap.beatsPerMeasure) % snap.beatsPerMeasure : 0;
      const isAccent = beatInMeasure === 0;
      this.scheduleClick(time, isAccent);
      this.nextClickBeat += 1;
    }

    this.timerId = window.setTimeout(() => this.scheduleLoop(), this.lookaheadMs);
  }

  private scheduleClick(time: number, isAccent: boolean) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.frequency.value = isAccent ? this.accentHz : this.beatHz;
    gain.gain.setValueAtTime(isAccent ? 0.35 : 0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(gain).connect(this.audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  }
}
