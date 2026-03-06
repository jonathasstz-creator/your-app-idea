/**
 * Audio Service - Web Audio API for MIDI playback
 * MIDIano-style: Toca notas automaticamente quando falling notes chegam ao playhead
 */

export class AudioService {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeOscillators: Map<number, OscillatorNode> = new Map();
  private isEnabled: boolean = false;
  private volume: number = 0.3; // Volume padrão (0.0 a 1.0)

  constructor() {
    // Inicializar AudioContext apenas quando necessário (user interaction)
    // Web Audio API requer user interaction para criar AudioContext
  }

  /**
   * Inicializa o AudioContext (deve ser chamado após user interaction).
   */
  async initialize(): Promise<boolean> {
    if (this.audioContext) {
      return true; // Já inicializado
    }

    try {
      // Usar AudioContext ou webkitAudioContext (Safari)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("[AudioService] Web Audio API não suportado");
        return false;
      }

      this.audioContext = new AudioContextClass();
      
      // Criar gain node para controle de volume
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      console.log("[AudioService] Inicializado com sucesso");
      return true;
    } catch (error) {
      console.error("[AudioService] Erro ao inicializar:", error);
      return false;
    }
  }

  /**
   * Ativa ou desativa o playback de áudio.
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    
    // Se desabilitar, parar todos os osciladores ativos
    if (!enabled) {
      this.stopAllNotes();
    }
  }

  /**
   * Define o volume (0.0 a 1.0).
   */
  setVolume(volume: number) {
    this.volume = Math.max(0.0, Math.min(1.0, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /**
   * Retorna o volume atual.
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Verifica se o áudio está habilitado.
   */
  getEnabled(): boolean {
    return this.isEnabled && this.audioContext !== null;
  }

  /**
   * Converte MIDI note para frequência (Hz).
   * Fórmula: frequency = 440 * 2^((midi-69)/12)
   * MIDI note 69 = A4 = 440 Hz
   */
  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Toca uma nota MIDI.
   * @param midi MIDI note number (0-127)
   * @param duration Duração em segundos (opcional, default 0.2s)
   * @param velocity Velocidade/volume da nota (0-127, opcional, default 100)
   */
  async playMidiNote(midi: number, duration: number = 0.2, velocity: number = 100): Promise<void> {
    if (!this.isEnabled || !this.audioContext || !this.gainNode) {
      return;
    }

    // Se já existe um oscilador para esta nota, parar antes de tocar novamente
    if (this.activeOscillators.has(midi)) {
      this.stopNote(midi);
    }

    try {
      // Criar oscilador (onda senoidal para som mais suave)
      const oscillator = this.audioContext.createOscillator();
      const noteGain = this.audioContext.createGain();

      // Configurar frequência baseada no MIDI note
      const frequency = this.midiToFrequency(midi);
      oscillator.type = 'sine'; // Onda senoidal (som mais suave)
      oscillator.frequency.value = frequency;

      // Configurar envelope ADSR simples (Attack-Decay-Sustain-Release)
      const now = this.audioContext.currentTime;
      const attackTime = 0.01; // Attack rápido (10ms)
      const releaseTime = 0.05; // Release rápido (50ms)
      
      // Normalizar velocity para gain (0-127 -> 0.0-1.0)
      const velocityGain = (velocity / 127) * 0.5; // Máximo 50% para evitar clipping
      
      // Conexões: oscillator -> noteGain -> gainNode -> destination
      oscillator.connect(noteGain);
      noteGain.connect(this.gainNode);

      // Envelope ADSR simples
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(velocityGain, now + attackTime); // Attack
      noteGain.gain.setValueAtTime(velocityGain, now + duration - releaseTime); // Sustain
      noteGain.gain.linearRampToValueAtTime(0, now + duration); // Release

      // Iniciar oscilador
      oscillator.start(now);
      
      // Armazenar oscilador ativo
      this.activeOscillators.set(midi, oscillator);

      // Parar e limpar após duração
      oscillator.stop(now + duration);
      oscillator.onended = () => {
        this.activeOscillators.delete(midi);
        noteGain.disconnect();
      };
    } catch (error) {
      console.error(`[AudioService] Erro ao tocar nota MIDI ${midi}:`, error);
    }
  }

  /**
   * Para uma nota MIDI específica.
   */
  stopNote(midi: number): void {
    const oscillator = this.activeOscillators.get(midi);
    if (oscillator && this.audioContext) {
      try {
        oscillator.stop(this.audioContext.currentTime);
        this.activeOscillators.delete(midi);
      } catch (error) {
        // Oscilador já pode ter terminado
        this.activeOscillators.delete(midi);
      }
    }
  }

  /**
   * Para todas as notas ativas.
   */
  stopAllNotes(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    for (const [midi, oscillator] of this.activeOscillators.entries()) {
      try {
        oscillator.stop(now);
      } catch (error) {
        // Ignorar erros (oscilador já pode ter terminado)
      }
    }
    this.activeOscillators.clear();
  }

  /**
   * Limpa recursos (deve ser chamado ao destruir).
   */
  dispose(): void {
    this.stopAllNotes();
    this.setEnabled(false);
    
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    
    this.gainNode = null;
  }
}
