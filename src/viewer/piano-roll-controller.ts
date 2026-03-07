
import { COLORS } from './constants';
import { isNumber, resizeCanvasToCssSize } from './utils';
import { calculateKeyLayout, getKeyRect, type KeyRect } from './key-layout';
import { AudioService } from './audio-service';

export interface PianoNote {
  midi: number;
  step: number;
  measure_index: number;
  beat: number;
  status?: string;
  duration?: number;
  duration_beats?: number;
  targetBeat?: number;
  hand_role?: string | null; // "left" | "right" | null (polyphonic V2)
}


// KeyGeometry alias for backward compatibility (uses KeyRect from key-layout)
type KeyGeometry = KeyRect;

export class PianoRollController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private notes: PianoNote[] = [];
  
  private currentProgress: number = 0;
  private targetProgress: number = 0;
  
  private animationFrame: number = 0;
  private lastTime: number = 0;
  private resizeObserver: ResizeObserver;
  private rafResize: number = 0;
  private beatsPerMeasure: number = 4;
  private pixelsPerBeat: number = 80;

  // Unified Geometry Cache
  private keyLayout: Map<number, KeyGeometry> = new Map();
  
  // MIDIano-style: Active notes (notas que o usuário está tocando no MIDI)
  // Set de MIDI numbers que estão ativas (note_on sem note_off correspondente)
  private activeNotes: Set<number> = new Set();
  
  // Audio service para playback automático (MIDIano-style)
  private audioService: AudioService | null = null;
  
  // Track de notas que já foram tocadas (para evitar tocar múltiplas vezes)
  private playedNotes: Set<number> = new Set();

  // Debug/input support
  private noteInputHandler?: (midi: number, velocity: number, source: "mouse" | "keyboard") => void;
  private mouseInputEnabled = false;
  private keyLabelsVisible = false;
  private keyLabelMap: Map<number, string> = new Map();

  constructor(canvas: HTMLCanvasElement, audioService?: AudioService) {
    if (audioService) {
      this.audioService = audioService;
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    
    const handleResize = () => {
      if (!this.canvas.parentElement) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return;
      
      // Use getBoundingClientRect() as single source of truth for container size
      resizeCanvasToCssSize(this.canvas, rect.width, rect.height);
      this.calculateLayout(rect.width);
      this.draw();

      // Debug: log resize info
      if (localStorage.getItem('debug_ui') === '1') {
        const dpr = window.devicePixelRatio || 1;
        console.log('[Canvas Resize]', {
          containerRect: { width: rect.width, height: rect.height },
          canvasCSS: { width: this.canvas.style.width, height: this.canvas.style.height },
          canvasAttr: { width: this.canvas.width, height: this.canvas.height },
          dpr
        });
      }
    };

    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.rafResize);
      this.rafResize = requestAnimationFrame(handleResize);
    });

    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
      handleResize();
    }

    // MIDIano-style: Virtual keyboard click/touch support
    this.setupVirtualKeyboardEvents();

    this.startLoop();
  }

  /**
   * Define handler para eventos de input (mouse/teclado) enviados ao pipeline principal.
   */
  setNoteInputHandler(handler?: (midi: number, velocity: number, source: "mouse" | "keyboard") => void) {
    this.noteInputHandler = handler;
  }

  /**
   * Ativa ou desativa envio de notas via mouse (debug mode).
   */
  setMouseInputEnabled(enabled: boolean) {
    this.mouseInputEnabled = enabled;
    this.canvas.style.cursor = enabled ? 'pointer' : 'default';
  }

  /**
   * Define labels de teclado a serem renderizadas nas teclas.
   */
  setKeyboardLabels(labels: Record<number, string> | Map<number, string> | null) {
    this.keyLabelMap.clear();
    this.keyLabelsVisible = Boolean(labels);
    if (labels) {
      const entries = labels instanceof Map ? labels.entries() : Object.entries(labels);
      for (const [midi, label] of entries) {
        const midiNum = typeof midi === "string" ? Number(midi) : midi;
        if (Number.isFinite(midiNum) && typeof label === "string") {
          this.keyLabelMap.set(midiNum, label);
        }
      }
    }
    this.draw();
  }

  /**
   * Calculates the key layout using the single source of truth (KeyLayout module).
   * This ensures that falling notes and keys are perfectly aligned.
   */
  private calculateLayout(width: number) {
    this.keyLayout = calculateKeyLayout(width);
  }

  setNotes(notes: PianoNote[], beatsPerMeasure: number = 4) {
    this.beatsPerMeasure = Number.isFinite(beatsPerMeasure) && beatsPerMeasure > 0 ? beatsPerMeasure : 4;
    this.notes = notes.map((note) => {
      const measure = Number.isFinite(note.measure_index) ? note.measure_index : 0;
      const beat = Number.isFinite(note.beat) ? note.beat : 0;
      const targetBeat =
        Number.isFinite((note as any).start_beat) && (note as any).start_beat !== undefined
          ? Number((note as any).start_beat)
          : measure * this.beatsPerMeasure + beat;
      return { ...note, targetBeat };
    });
    this.currentProgress = 0;
    this.targetProgress = 0;

    // Debug: log note range
    if (localStorage.getItem('debug_ui') === '1' && notes.length > 0) {
      const midis = notes.map(n => n.midi).filter(m => m !== undefined);
      const midiMin = Math.min(...midis);
      const midiMax = Math.max(...midis);
      console.log('[PianoRoll] Notes loaded:', {
        count: notes.length,
        midiRange: { min: midiMin, max: midiMax },
        first10Pitches: notes.slice(0, 10).map(n => ({ midi: n.midi, step: n.step }))
      });
    }
  }
  
  /**
   * Atualiza apenas o mapeamento de beats por compasso sem resetar progresso.
   */
  setBeatsPerMeasure(beatsPerMeasure: number) {
    if (!Number.isFinite(beatsPerMeasure) || beatsPerMeasure <= 0) return;
    this.beatsPerMeasure = beatsPerMeasure;
    this.notes = this.notes.map((note) => {
      const measure = Number.isFinite(note.measure_index) ? note.measure_index : 0;
      const beat = Number.isFinite(note.beat) ? note.beat : 0;
      return { ...note, targetBeat: measure * this.beatsPerMeasure + beat };
    });
  }

  updateProgress(stepIndex: number) {
    if (this.notes[stepIndex]) {
      const note = this.notes[stepIndex];
      const fallback = note.measure_index * this.beatsPerMeasure + note.beat;
      this.targetProgress = note.targetBeat ?? fallback;
    } else {
      this.targetProgress = stepIndex;
    }
  }
  
  /**
   * Atualiza progressão contínua por beat (modo TIME_FILM).
   */
  updateByBeat(beatNow: number) {
    if (!Number.isFinite(beatNow)) return;
    // aceita beat negativo para count-in (preparo visual)
    this.targetProgress = beatNow;
    this.currentProgress = beatNow; // FILM: manter determinístico, sem smoothing
  }
  
  setPixelsPerBeat(px: number) {
    if (!Number.isFinite(px) || px <= 0) return;
    this.pixelsPerBeat = px;
  }
  
  /**
   * MIDIano-style: Atualiza notas ativas para highlight visual imediato.
   * Quando o usuário toca uma nota no MIDI, ela é destacada imediatamente
   * (independente de ser HIT ou MISS).
   */
  setActiveNote(midi: number, isActive: boolean) {
    if (isActive) {
      this.activeNotes.add(midi);
    } else {
      this.activeNotes.delete(midi);
    }
    // Trigger redraw para mostrar highlight imediatamente
    this.draw();
  }
  
  /**
   * Limpa todas as notas ativas (útil para reset).
   */
  clearActiveNotes() {
    this.activeNotes.clear();
    this.draw();
  }
  
  /**
   * Define o audio service (para playback automático).
   */
  setAudioService(audioService: AudioService | null) {
    this.audioService = audioService;
  }
  
  /**
   * Limpa o histórico de notas tocadas (útil para reset).
   */
  clearPlayedNotes() {
    this.playedNotes.clear();
  }

  /**
   * MIDIano-style: Configura eventos de mouse/touch para teclado virtual.
   * Permite tocar notas clicando no teclado, como no MIDIano.
   */
  private setupVirtualKeyboardEvents() {
    const keyboardHeight = 120;
    let pressedKeys = new Set<number>(); // Track de teclas pressionadas no mouse/touch
    
    // Helper: Converte coordenadas do mouse/touch para MIDI note
    const getMidiFromCoords = (clientX: number, clientY: number): number | null => {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      // Verificar se clique está na área do teclado (últimos 120px)
      const canvasHeight = parseFloat(this.canvas.style.height) || rect.height;
      const keyboardY = canvasHeight - keyboardHeight;
      
      if (y < keyboardY || y > canvasHeight) {
        return null; // Clique fora da área do teclado
      }
      
      // Encontrar qual tecla foi clicada
      for (const [midi, geo] of this.keyLayout.entries()) {
        // Verificar se está dentro do retângulo da tecla (white keys)
        if (!geo.isBlack) {
          if (x >= geo.x && x <= geo.x + geo.w && y >= keyboardY && y <= canvasHeight) {
            return midi;
          }
        } else {
          // Black keys são menores (altura ~62% do keyboard)
          const blackKeyHeight = keyboardHeight * 0.62;
          if (x >= geo.x && x <= geo.x + geo.w && y >= keyboardY && y <= keyboardY + blackKeyHeight) {
            return midi;
          }
        }
      }
      
      return null;
    };
    
    // Helper: Tocar nota (visual + audio)
    const playNote = (midi: number) => {
      if (pressedKeys.has(midi)) return; // Já está pressionada
      pressedKeys.add(midi);
      
      // 1. Visual feedback (highlight da tecla)
      this.setActiveNote(midi, true);
      // 1b. Enviar para pipeline de debug (se habilitado)
      if (this.mouseInputEnabled && this.noteInputHandler) {
        this.noteInputHandler(midi, 100, "mouse");
      }
      
      // 2. Audio feedback (se audio service estiver disponível)
      if (this.audioService) {
        this.audioService.playMidiNote(midi, 0.2, 100).catch(err => {
          console.warn(`[VirtualKeyboard] Erro ao tocar nota ${midi}:`, err);
        });
      }
    };
    
    // Helper: Parar nota (visual + audio)
    const stopNote = (midi: number) => {
      if (!pressedKeys.has(midi)) return; // Não estava pressionada
      pressedKeys.delete(midi);
      
      // Remover highlight visual
      this.setActiveNote(midi, false);
      if (this.mouseInputEnabled && this.noteInputHandler) {
        this.noteInputHandler(midi, 0, "mouse");
      }
      
      // Parar audio (se necessário)
      if (this.audioService) {
        this.audioService.stopNote(midi);
      }
    };
    
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      const midi = getMidiFromCoords(e.clientX, e.clientY);
      if (midi !== null) {
        e.preventDefault();
        playNote(midi);
      }
    });
    
    this.canvas.addEventListener('mouseup', (e) => {
      // Parar todas as teclas pressionadas
      for (const midi of pressedKeys) {
        stopNote(midi);
      }
      pressedKeys.clear();
    });
    
    // Parar nota quando mouse sai da teclado (mouseleave)
    this.canvas.addEventListener('mouseleave', () => {
      for (const midi of pressedKeys) {
        stopNote(midi);
      }
      pressedKeys.clear();
    });
    
    // Touch events (para mobile/tablet)
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const midi = getMidiFromCoords(touch.clientX, touch.clientY);
        if (midi !== null) {
          playNote(midi);
        }
      }
    });
    
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      // Parar todas as teclas pressionadas
      for (const midi of pressedKeys) {
        stopNote(midi);
      }
      pressedKeys.clear();
    });
    
    this.canvas.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      // Parar todas as teclas pressionadas
      for (const midi of pressedKeys) {
        stopNote(midi);
      }
      pressedKeys.clear();
    });
    
    // Melhorar UX: Cursor pointer quando sobre o teclado
    this.canvas.style.cursor = 'pointer';
  }

  private startLoop() {
    const render = (time: number) => {
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      const lerpFactor = 0.15;
      this.currentProgress += (this.targetProgress - this.currentProgress) * lerpFactor;
      this.draw();
      this.animationFrame = requestAnimationFrame(render);
    };
    this.animationFrame = requestAnimationFrame(render);
  }

  private draw() {
    const widthStr = this.canvas.style.width;
    const heightStr = this.canvas.style.height;
    if (!widthStr || !heightStr) return;

    const width = parseFloat(widthStr);
    const height = parseFloat(heightStr);
    if (isNaN(width) || isNaN(height)) return;

    this.ctx.fillStyle = COLORS.PIANO_BG;
    this.ctx.fillRect(0, 0, width, height);

    // Piano keyboard height: 120px provides better visual presence (MIDIano/Synthesia style)
    // Too small (<100px) looks like a line, too large (>160px) takes too much space
    const keyboardHeight = 120;
    const playheadY = height - keyboardHeight;
    const pixelsPerBeat = this.pixelsPerBeat;

    // 1. Guides (Vertical lines behind notes - subtle grid for visual alignment)
    // Very subtle to not interfere with falling notes visibility
    this.ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    this.ctx.lineWidth = 1;
    this.keyLayout.forEach(geo => {
      if (!geo.isBlack) {
        this.ctx.beginPath();
        this.ctx.moveTo(geo.x, 0);
        this.ctx.lineTo(geo.x, playheadY);
        this.ctx.stroke();
      }
    });

    // 2. Falling Notes (Rendered BEFORE keyboard to stay behind it)
    // Use single source of truth: KeyLayout
    this.notes.forEach(note => {
      const geo = getKeyRect(this.keyLayout, note.midi);
      if (!geo) {
        // Debug: log missing key geometry
        if (localStorage.getItem('debug_ui') === '1') {
          console.warn(`[KeyLayout] Missing geometry for MIDI ${note.midi}`);
        }
        return;
      }

      const notePos = note.targetBeat ?? note.measure_index * this.beatsPerMeasure + note.beat;
      const relativePos = notePos - this.currentProgress;
      
      // MIDIano-style: Play audio quando falling note chega ao playhead
      // Toca quando relativePos cruza 0 (nota chegou ao playhead)
      if (this.audioService && this.audioService.getEnabled()) {
        const playheadTolerance = 0.05; // Tolerância para detectar quando chegou ao playhead
        if (relativePos >= -playheadTolerance && relativePos <= playheadTolerance) {
          // Criar ID único para esta nota (midi + step para evitar duplicatas)
          const noteId = note.midi * 1000 + (note.step || 0);
          if (!this.playedNotes.has(noteId)) {
            // Tocar nota (duração baseada na duration da nota, ou 0.2s padrão)
            const duration = note.duration ? note.duration : 0.2;
            this.audioService.playMidiNote(note.midi, duration, 100).catch(err => {
              console.warn(`[PianoRoll] Erro ao tocar nota ${note.midi}:`, err);
            });
            this.playedNotes.add(noteId);
            
            // Limpar played notes antigas (manter apenas as últimas 100)
            if (this.playedNotes.size > 100) {
              const first = this.playedNotes.values().next().value;
              if (first !== undefined) {
                this.playedNotes.delete(first);
              }
            }
          }
        }
        // Reset played note se nota já passou do playhead (para poder tocar novamente se voltar)
        else if (relativePos < -0.2) {
          const noteId = note.midi * 1000 + (note.step || 0);
          this.playedNotes.delete(noteId);
        }
      }
      
      if (relativePos > -4 && relativePos < 24) {
        const y = playheadY - relativePos * pixelsPerBeat;
        const noteHeight = Math.max(20, pixelsPerBeat * (note.duration_beats ?? 1));

        // MIDIano-style: Active note highlight (quando usuário toca no MIDI, independente de status)
        // Prioridade: Active > HIT > MISS > default
        const isActive = this.activeNotes.has(note.midi);
        
        if (isActive) {
          // Nota ativa (usuário está tocando): destaque especial (dourado/amarelo)
          this.ctx.fillStyle = COLORS.ACTIVE_FALLING_NOTE;
          this.ctx.shadowBlur = 25;
          this.ctx.shadowColor = COLORS.ACTIVE_FALLING_NOTE;
        } else if (note.status === "HIT") {
          this.ctx.fillStyle = COLORS.HIT;
          this.ctx.shadowBlur = 20;
          this.ctx.shadowColor = COLORS.HIT;
        } else if (note.status === "MISS") {
          this.ctx.fillStyle = COLORS.MISS;
          this.ctx.shadowBlur = 15;
          this.ctx.shadowColor = COLORS.MISS;
        } else {
          // Hand-role coloring for polyphonic lessons
          if (note.hand_role === 'left') {
            this.ctx.fillStyle = geo.isBlack ? '#2a4a8f' : '#5B8DEF';
          } else if (note.hand_role === 'right') {
            this.ctx.fillStyle = geo.isBlack ? '#8a4a00' : '#F5A623';
          } else {
            this.ctx.fillStyle = geo.isBlack ? '#34495e' : COLORS.PRIMARY_NEON;
          }
          this.ctx.shadowBlur = 0;
          if (relativePos < 0) this.ctx.fillStyle = 'rgba(0, 242, 255, 0.2)';
        }

        // Note width is slightly thinner than key to have gaps
        const nWidth = geo.w * 0.9;
        const nX = geo.centerX - nWidth / 2;

        this.drawRoundedRect(nX, y - noteHeight, nWidth, noteHeight, 4);
        this.ctx.shadowBlur = 0;

        // Debug overlay: draw note name and centerX
        if (localStorage.getItem('debug_ui') === '1') {
          const noteName = this.midiToNoteName(note.midi);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = '10px monospace';
          this.ctx.fillText(`${noteName}`, nX + 2, y - noteHeight + 12);
          this.ctx.strokeStyle = '#00ff00';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(geo.centerX, y - noteHeight - 5);
          this.ctx.lineTo(geo.centerX, y - noteHeight + 5);
          this.ctx.stroke();
        }
      }
    });

    // 3. Piano Keyboard (Synthesia Style: White keys then Black keys on top)
    this.drawKeyboard(width, height, keyboardHeight, playheadY);
  }

  private drawKeyboard(width: number, height: number, kHeight: number, yPos: number) {
    const debugMode = localStorage.getItem('debug_ui') === '1';

    // Pass 1: White Keys (with better contrast and separation)
    // Darker border for better key separation (MIDIano/Synthesia style)
    this.ctx.strokeStyle = '#999';
    this.ctx.lineWidth = 1.5;
    this.keyLayout.forEach(geo => {
      if (!geo.isBlack) {
        // White key fill
        this.ctx.fillStyle = COLORS.WHITE_KEY;
        this.ctx.fillRect(geo.x, yPos, geo.w, kHeight);
        // Key border for separation (subtle gray, not too dark)
        this.ctx.strokeRect(geo.x + 0.5, yPos + 0.5, geo.w - 1, kHeight - 1);
        
        // Active highlight (preserve border by not overwriting entire rect)
        // 1. HIT highlight (quando acertou a nota esperada)
        const active = this.notes.some(
          n =>
            n.midi === geo.midi &&
            n.status === "HIT" &&
            Math.abs(
              (n.targetBeat ?? (n.measure_index * this.beatsPerMeasure + n.beat)) - this.currentProgress
            ) < 0.08
        );
        if (active) {
            this.ctx.fillStyle = COLORS.KEY_HIGHLIGHT;
            this.ctx.fillRect(geo.x + 1, yPos + 1, geo.w - 2, kHeight - 2);
        }
        
        // 2. MIDIano-style: Active note highlight (quando usuário toca no MIDI, independente de HIT/MISS)
        if (this.activeNotes.has(geo.midi)) {
            this.ctx.fillStyle = COLORS.ACTIVE_NOTE;
            this.ctx.fillRect(geo.x + 1, yPos + 1, geo.w - 2, kHeight - 2);
        }

        // Debug overlay: keyboard shortcut labels
        if (this.keyLabelsVisible) {
          const label = this.keyLabelMap.get(geo.midi);
          if (label) {
            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            this.ctx.font = '11px "Inter", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'alphabetic';
            this.ctx.fillText(label, geo.centerX, yPos + kHeight - 10);
          }
        }

        // Debug overlay: draw key rectangle and centerX
        if (debugMode) {
          this.ctx.strokeStyle = '#00ff00';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(geo.x, yPos, geo.w, kHeight);
          this.ctx.beginPath();
          this.ctx.moveTo(geo.centerX, yPos);
          this.ctx.lineTo(geo.centerX, yPos + kHeight);
          this.ctx.stroke();
          this.ctx.fillStyle = '#00ff00';
          this.ctx.font = '8px monospace';
          this.ctx.fillText(`${geo.midi}`, geo.x + 2, yPos + 12);
        }
      }
    });

    // Pass 2: Black Keys (Layered on top - typical piano proportion ~62% of white key height)
    // This creates the visual depth that makes it look like a real piano
    const blackKeyHeight = kHeight * 0.62;
    this.keyLayout.forEach(geo => {
      if (geo.isBlack) {
        // Black key with subtle rounded top corners (piano-like appearance)
        this.ctx.fillStyle = COLORS.BLACK_KEY;
        this.drawRoundedRect(geo.x, yPos, geo.w, blackKeyHeight, 2);
        
        // Subtle border/shine for depth (darker shadow on left, lighter on right)
        this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Left edge shadow for 3D effect
        this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(geo.x + 0.5, yPos);
        this.ctx.lineTo(geo.x + 0.5, yPos + blackKeyHeight);
        this.ctx.stroke();

        // 1. HIT highlight (quando acertou a nota esperada)
        const active = this.notes.some(
          n =>
            n.midi === geo.midi &&
            n.status === "HIT" &&
            Math.abs(
              (n.targetBeat ?? (n.measure_index * this.beatsPerMeasure + n.beat)) - this.currentProgress
            ) < 0.08
        );
        if (active) {
            this.ctx.fillStyle = COLORS.HIT;
            this.ctx.globalAlpha = 0.7;
            this.drawRoundedRect(geo.x, yPos, geo.w, blackKeyHeight, 2);
            this.ctx.globalAlpha = 1.0;
        }
        
        // 2. MIDIano-style: Active note highlight (quando usuário toca no MIDI, independente de HIT/MISS)
        if (this.activeNotes.has(geo.midi)) {
            this.ctx.fillStyle = COLORS.ACTIVE_NOTE;
            this.ctx.globalAlpha = 0.8;
            this.drawRoundedRect(geo.x, yPos, geo.w, blackKeyHeight, 2);
            this.ctx.globalAlpha = 1.0;
        }

        // Debug overlay: keyboard shortcut labels
        if (this.keyLabelsVisible) {
          const label = this.keyLabelMap.get(geo.midi);
          if (label) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.ctx.font = '10px "Inter", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, geo.centerX, yPos + blackKeyHeight - 14);
          }
        }

        // Debug overlay: draw key rectangle and centerX
        if (debugMode) {
          this.ctx.strokeStyle = '#ff00ff';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(geo.x, yPos, geo.w, blackKeyHeight);
          this.ctx.beginPath();
          this.ctx.moveTo(geo.centerX, yPos);
          this.ctx.lineTo(geo.centerX, yPos + blackKeyHeight);
          this.ctx.stroke();
          this.ctx.fillStyle = '#ff00ff';
          this.ctx.font = '8px monospace';
          this.ctx.fillText(`${geo.midi}`, geo.x + 2, yPos + 10);
        }
      }
    });

    // High-visibility Playhead Line
    this.ctx.strokeStyle = COLORS.PRIMARY_NEON;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, yPos);
    this.ctx.lineTo(width, yPos);
    this.ctx.stroke();
  }

  private midiToNoteName(midi: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}${octave}`;
  }

  private drawRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  public destroy() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.rafResize);
  }
}
