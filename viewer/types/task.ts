/**
 * TIPOS ENDSCREEN - V1 MONOFÔNICO + V2 POLIFÔNICO
 * 
 * Arquivo: viewer/types/task.ts
 * Status: Zero quebras backend
 * Garantias: localStorage isolado, sem API calls
 */

// ============================================================
// TYPES: ENTRADA (do modo WAIT/FILM)
// ============================================================

export interface AttemptLog {
  stepIndex: number;
  midi: number | number[];           // V1: number | V2: number[] (acorde)
  noteName: string;                  // "G4"
  expected: number | number[];       // o que era esperado
  success: boolean;                  // acertou?
  responseMs?: number;               // latência da resposta
  timestamp: number;                 // Date.now()
}

// ============================================================
// TYPES: SAÍDA (TaskResultSummary)
// ============================================================

export interface PerNoteStatV1 {
  midi: number;
  noteName: string;                  // "G4"
  label?: string;                    // "Sol4 (segunda linha)"
  correct: number;                   // quantas vezes acertou
  total: number;                     // quantas vezes apareceu
  pct: number;                       // 0-100
}

export interface PerChordStatV2 {
  midiGroup: number[];               // [60, 64, 67]
  chordName: string;                 // "C Major" ou "Cmaj"
  label?: string;                    // "Dó Maior"
  correct: number;                   // acertos (acorde completo)
  total: number;                     // aparições
  pct: number;                       // 0-100
  notes: Array<{                     // breakdown por nota
    midi: number;
    noteName: string;
    correct: number;
    total: number;
  }>;
}

export type TaskMode = "WAIT" | "FILM";
export type TaskVersion = "V1" | "V2";

/**
 * V1: MONOFÔNICO
 * - Uma nota por vez
 * - Score linear: correctSteps * 100
 * - Per-note stats simples
 */
export interface TaskResultSummaryV1 {
  version: "V1";
  mode: TaskMode;
  lessonId?: string;
  chapterId?: number;

  // Contagem
  totalSteps: number;
  correctSteps: number;
  duration?: number;                 // duração desta sessão (ms)

  // Score
  scoreBase: number;                 // correctSteps * 100
  timeBonus: number;                 // sempre 0 em V1
  totalScore: number;                // = scoreBase

  // Timing (opcional em V1)
  responseMsAvg?: number;
  responseMsMin?: number;
  responseMsMax?: number;

  // Estrelas
  starsEarned: number;               // 0-5
  stars3RequiredCorrect?: number;    // threshold não visível em V1

  // Persistência: high score
  highScore?: number;                // localStorage — melhor pontuação

  // Recordes Pessoais (Personal Bests)
  bestTime?: number;                 // menor duração já registrada (ms)
  bestResponseTime?: number;         // menor responseMsAvg já registrado (ms)
  sessionCount: number;              // total de sessões completadas (≥1)

  // Flags: o que foi batido nesta sessão
  isNewScoreRecord: boolean;
  isNewTimeRecord: boolean;
  isNewResponseRecord: boolean;

  // Deltas vs recorde anterior (presentes apenas quando a flag = true)
  scoreDelta?: number;               // pts acima do recorde anterior
  timeSavedMs?: number;              // ms economizados vs melhor tempo anterior
  responseTimeSavedMs?: number;      // ms economizados vs melhor reflexo anterior

  // Stats por nota
  perNote: PerNoteStatV1[];
  perChord?: undefined;              // N/A em V1
}

/**
 * V2: POLIFÔNICO
 * - Acordes e notas individuais
 * - Score: scoreBase + timeBonus
 * - Per-chord stats com breakdown
 * - Threshold 3 estrelas visível
 */
export interface TaskResultSummaryV2 {
  version: "V2";
  mode: TaskMode;
  lessonId?: string;
  chapterId?: number;

  // Contagem (step-level — unidade pedagógica)
  totalSteps: number;                // passos/acordes
  correctSteps: number;              // steps fully completed (all notes hit)

  // Note-level metrics (complementar)
  totalExpectedNotes?: number;       // total de notas individuais nos attempts
  correctNotes?: number;             // notas individuais acertadas
  noteAccuracy?: number;             // correctNotes / totalExpectedNotes (0..1)

  // Score
  scoreBase: number;                 // correctSteps * 100
  timeBonus: number;                 // V2: bonus por tempo (pode ser 0)
  totalScore: number;                // scoreBase + timeBonus

  // Timing (obrigatório em V2)
  responseMsAvg: number;
  responseMsMin: number;
  responseMsMax: number;

  // Estrelas
  starsEarned: number;               // 0-5
  stars3RequiredCorrect: number;     // threshold VISÍVEL (e.g., 26/32)

  // Persistência
  highScore: number;                 // localStorage

  // Stats: Acordes (primário em V2)
  perChord: PerChordStatV2[];

  // Stats: Notas (fallback/detailed)
  perNote?: PerNoteStatV1[];
}

export type TaskResultSummary = TaskResultSummaryV1 | TaskResultSummaryV2;

// ============================================================
// HELPER: Type Guards
// ============================================================

export function isV1(result: TaskResultSummary): result is TaskResultSummaryV1 {
  return result.version === "V1";
}

export function isV2(result: TaskResultSummary): result is TaskResultSummaryV2 {
  return result.version === "V2";
}

// ============================================================
// CONSTANTS: Score/Star Rules
// ============================================================

export const STAR_THRESHOLDS = {
  STARS_5: 1.0,           // 100%
  STARS_4: 0.9,           // 90%
  STARS_3: 0.8125,        // 81.25% (26/32)
  STARS_2: 0.65,          // 65%
  STARS_1: 0.5,           // 50%
} as const;

export const SCORE_PER_CORRECT = 100;  // 1 acerto = 100 pontos

// ============================================================
// HELPER: Calculate Stars from percentage
// ============================================================

export function calculateStars(correctSteps: number, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  const pct = correctSteps / totalSteps;

  if (pct === STAR_THRESHOLDS.STARS_5) return 5;
  if (pct >= STAR_THRESHOLDS.STARS_4) return 4;
  if (pct >= STAR_THRESHOLDS.STARS_3) return 3;
  if (pct >= STAR_THRESHOLDS.STARS_2) return 2;
  if (pct >= STAR_THRESHOLDS.STARS_1) return 1;
  return 0;
}

export function calculate3StarRequirement(totalSteps: number): number {
  return Math.ceil(totalSteps * STAR_THRESHOLDS.STARS_3);
}

// ============================================================
// HELPER: localStorage keys
// ============================================================

export function getHighScoreKey(
  lessonId: string | undefined,
  chapterId: number | undefined,
  mode: TaskMode
): string {
  const lesson = lessonId || "unknown";
  const chapter = chapterId ?? 0;
  return `hs_${lesson}_${chapter}_${mode}`.toLowerCase();
}

export function getAttemptHistoryKey(
  lessonId: string | undefined,
  chapterId: number | undefined
): string {
  const lesson = lessonId || "unknown";
  const chapter = chapterId ?? 0;
  return `attempts_${lesson}_${chapter}`;
}

export function getBestTimeKey(
  lessonId: string | undefined,
  chapterId: number | undefined,
  mode: TaskMode
): string {
  const lesson = lessonId || "unknown";
  const chapter = chapterId ?? 0;
  return `bt_${lesson}_${chapter}_${mode}`.toLowerCase();
}

export function getBestResponseTimeKey(
  lessonId: string | undefined,
  chapterId: number | undefined,
  mode: TaskMode
): string {
  const lesson = lessonId || "unknown";
  const chapter = chapterId ?? 0;
  return `brt_${lesson}_${chapter}_${mode}`.toLowerCase();
}

export function getSessionCountKey(
  lessonId: string | undefined,
  chapterId: number | undefined,
  mode: TaskMode
): string {
  const lesson = lessonId || "unknown";
  const chapter = chapterId ?? 0;
  return `sc_${lesson}_${chapter}_${mode}`.toLowerCase();
}
