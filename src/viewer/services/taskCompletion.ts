/**
 * SERVIÇO DE CONCLUSÃO DE TAREFA
 * Arquivo: viewer/services/taskCompletion.ts
 * 
 * 🔒 PONTO Único DE TRUTH
 * - Centraliza lógica de fim de tarefa
 * - Chamado por WAIT e FILM
 * - Zero backend, 100% front-end
 * - localStorage isolado (safe)
 *
 * ## V2 Scoring Contract
 *
 * AttemptLog is NOT the source of truth for completed steps in V2.
 * In WAIT/FILM polyphonic flows, retries and misses remain in the log,
 * but the engine score reflects the real number of completed steps.
 *
 * Therefore:
 * - correctSteps comes from engine.getCompletedSteps()
 * - totalExpectedNotes comes from engine.getTotalExpectedNotes()
 * - correctNotes is derived per step counting unique expected midis satisfied
 *   (no inflation from retries or duplicate successes)
 *
 * Attempt aggregation is used only as a legacy fallback when engineStats
 * is unavailable.
 */

import {
  TaskResultSummary,
  TaskResultSummaryV1,
  TaskResultSummaryV2,
  AttemptLog,
  TaskMode,
  PerNoteStatV1,
  PerChordStatV2,
  SCORE_PER_CORRECT,
  calculateStars,
  calculate3StarRequirement,
  getHighScoreKey,
  getBestTimeKey,
  getBestResponseTimeKey,
  getSessionCountKey,
} from "../types/task";

// ============================================================
// API PÚblica
// ============================================================

/**
 * Computa resultado completo da tarefa (V1 ou V2)
 * Baseado no modo: se tem acordes => V2, senão => V1
 */
export function computeTaskResult(
  attempts: AttemptLog[],
  totalSteps: number,
  mode: TaskMode,
  lessonId?: string,
  chapterId?: number,
  version: "V1" | "V2" = "V1",
  engineStats?: { completedSteps: number; totalExpectedNotes: number }
): TaskResultSummary {
  // ── Derive correctSteps at the RIGHT granularity ──
  // V2 with engineStats: use engine truth (score = completed steps, structure = expected notes)
  // V2 without engineStats: fallback to attempt aggregation (legacy/test compat)
  // V1: 1 attempt = 1 step, counting successes works
  let correctSteps: number;
  let totalExpectedNotes: number | undefined;
  let correctNotes: number | undefined;

  if (version === "V2" && engineStats) {
    // ── ENGINE TRUTH PATH (preferred) ──
    correctSteps = engineStats.completedSteps;
    totalExpectedNotes = engineStats.totalExpectedNotes;

    // correctNotes: for completed steps, ALL expected notes were satisfied by definition
    // (engine only advances when chordNotes.every(m => stepState.has(m))).
    // For incomplete/partial steps, count unique expected midis with at least one success.
    const stepExpected = new Map<number, Set<number>>();
    for (const a of attempts) {
      if (!stepExpected.has(a.stepIndex)) stepExpected.set(a.stepIndex, new Set());
      const expected = Array.isArray(a.expected) ? a.expected : [a.expected];
      expected.forEach(e => stepExpected.get(a.stepIndex)!.add(e));
    }

    let cn = 0;
    for (const [si, expectedSet] of stepExpected) {
      if (si < correctSteps) {
        // Completed step: all expected notes are correct by engine invariant
        cn += expectedSet.size;
      } else {
        // Partial/incomplete step: count unique expected midis with success
        const successMidis = new Set<number>();
        for (const a of attempts) {
          if (a.stepIndex === si && a.success) {
            const midis = Array.isArray(a.midi) ? a.midi : [a.midi];
            midis.forEach(m => successMidis.add(m));
          }
        }
        cn += Array.from(expectedSet).filter(e => successMidis.has(e)).length;
      }
    }
    correctNotes = cn;
  } else if (version === "V2") {
    // ── FALLBACK PATH (no engineStats, legacy compat) ──
    const stepMap = new Map<number, { successes: number; total: number }>();
    for (const a of attempts) {
      if (!stepMap.has(a.stepIndex)) stepMap.set(a.stepIndex, { successes: 0, total: 0 });
      const entry = stepMap.get(a.stepIndex)!;
      entry.total++;
      if (a.success) entry.successes++;
    }
    correctSteps = 0;
    for (const [, entry] of stepMap) {
      const hasFail = entry.total > entry.successes;
      if (entry.successes > 0 && !hasFail) correctSteps++;
    }
    totalExpectedNotes = attempts.length;
    correctNotes = attempts.filter((a) => a.success).length;
  } else {
    // V1: 1 attempt = 1 step
    correctSteps = attempts.filter((a) => a.success).length;
  }

  const scoreBase = correctSteps * SCORE_PER_CORRECT;

  // Extract timing data
  const responseTimes = attempts
    .filter((a) => a.responseMs !== undefined)
    .map((a) => a.responseMs!);

  const responseMsAvg =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b) / responseTimes.length)
      : undefined;

  const responseMsMin =
    responseTimes.length > 0 ? Math.min(...responseTimes) : undefined;

  const responseMsMax =
    responseTimes.length > 0 ? Math.max(...responseTimes) : undefined;

  // Stars e threshold
  const starsEarned = calculateStars(correctSteps, totalSteps);
  const stars3Required = calculate3StarRequirement(totalSteps);

  // Duration desta sessão (primeiro ao último attempt + responseMs final)
  const duration = attempts.length > 0
    ? (attempts[attempts.length - 1].timestamp - attempts[0].timestamp)
      + (attempts[attempts.length - 1].responseMs ?? 0)
    : undefined;

  // High score (localStorage)
  const hsKey = getHighScoreKey(lessonId, chapterId, mode);
  const storedHs = localStorage.getItem(hsKey);
  const previousHighScore = storedHs ? parseInt(storedHs, 10) : 0;
  const highScore = Math.max(scoreBase, previousHighScore);
  localStorage.setItem(hsKey, String(highScore));

  // Session count
  const scKey = getSessionCountKey(lessonId, chapterId, mode);
  const storedSc = localStorage.getItem(scKey);
  const sessionCount = (storedSc ? parseInt(storedSc, 10) : 0) + 1;
  localStorage.setItem(scKey, String(sessionCount));

  // Best time (menor duração = melhor; só faz sentido com ≥2 sessões)
  const btKey = getBestTimeKey(lessonId, chapterId, mode);
  const storedBt = localStorage.getItem(btKey);
  const previousBestTime = storedBt ? parseInt(storedBt, 10) : undefined;
  const isNewTimeRecord =
    sessionCount > 1 &&
    duration !== undefined &&
    previousBestTime !== undefined &&
    duration < previousBestTime;
  const timeSavedMs = isNewTimeRecord && previousBestTime !== undefined
    ? previousBestTime - duration!
    : undefined;
  const bestTime = duration !== undefined
    ? (previousBestTime === undefined ? duration : Math.min(duration, previousBestTime))
    : previousBestTime;
  if (bestTime !== undefined) localStorage.setItem(btKey, String(bestTime));

  // Best response time (menor avg = melhor reflexo)
  const brtKey = getBestResponseTimeKey(lessonId, chapterId, mode);
  const storedBrt = localStorage.getItem(brtKey);
  const previousBestResponseTime = storedBrt ? parseInt(storedBrt, 10) : undefined;
  const isNewResponseRecord =
    sessionCount > 1 &&
    responseMsAvg !== undefined &&
    previousBestResponseTime !== undefined &&
    responseMsAvg < previousBestResponseTime;
  const responseTimeSavedMs = isNewResponseRecord && previousBestResponseTime !== undefined
    ? previousBestResponseTime - responseMsAvg!
    : undefined;
  const bestResponseTime = responseMsAvg !== undefined
    ? (previousBestResponseTime === undefined ? responseMsAvg : Math.min(responseMsAvg, previousBestResponseTime))
    : previousBestResponseTime;
  if (bestResponseTime !== undefined) localStorage.setItem(brtKey, String(bestResponseTime));

  // New score record (só válido na 2ª sessão em diante)
  const isNewScoreRecord = sessionCount > 1 && scoreBase > previousHighScore;
  const scoreDelta = isNewScoreRecord ? scoreBase - previousHighScore : undefined;

  // ========== V1: MONOFÔNICO ==========
  if (version === "V1") {
    return {
      version: "V1",
      mode,
      lessonId,
      chapterId,
      totalSteps,
      correctSteps,
      duration,
      scoreBase,
      timeBonus: 0,
      totalScore: scoreBase,
      responseMsAvg,
      responseMsMin,
      responseMsMax,
      starsEarned,
      stars3RequiredCorrect: undefined,
      highScore,
      bestTime,
      bestResponseTime,
      sessionCount,
      isNewScoreRecord,
      isNewTimeRecord,
      isNewResponseRecord,
      scoreDelta,
      timeSavedMs,
      responseTimeSavedMs,
      perNote: computePerNoteStatsV1(attempts),
    } as TaskResultSummaryV1;
  }

  // ========== V2: POLIFÔNICO ==========
  // Detecta se há acordes nos dados
  const hasChords = attempts.some((a) => Array.isArray(a.midi));

  const perChord = hasChords ? computePerChordStatsV2(attempts) : [];
  const perNote = computePerNoteStatsV1(attempts);

  const noteAccuracy = totalExpectedNotes && totalExpectedNotes > 0
    ? correctNotes! / totalExpectedNotes
    : undefined;

  return {
    version: "V2",
    mode,
    lessonId,
    chapterId,
    totalSteps,
    correctSteps,
    totalExpectedNotes,
    correctNotes,
    noteAccuracy,
    scoreBase,
    timeBonus: 0, // TODO: implementar logic de time bonus
    totalScore: scoreBase, // = scoreBase + 0
    responseMsAvg: responseMsAvg || 0,
    responseMsMin: responseMsMin || 0,
    responseMsMax: responseMsMax || 0,
    starsEarned,
    stars3RequiredCorrect: stars3Required,
    highScore,
    perChord,
    perNote,
  } as TaskResultSummaryV2;
}

/**
 * V1: Calcula stats POR NOTA (monofônico)
 * Agrupa por MIDI, ignora acordes
 */
function computePerNoteStatsV1(attempts: AttemptLog[]): PerNoteStatV1[] {
  const byMidi = new Map<
    number,
    {
      correct: number;
      total: number;
      noteName: string;
      label?: string;
    }
  >();

  for (const attempt of attempts) {
    // Se for acorde, explode
    const midiArray = Array.isArray(attempt.midi)
      ? attempt.midi
      : [attempt.midi];

    for (const midi of midiArray) {
      if (!byMidi.has(midi)) {
        byMidi.set(midi, {
          correct: 0,
          total: 0,
          noteName: getMidiNoteName(midi),
          label: getMidiLabel(midi),
        });
      }

      const entry = byMidi.get(midi)!;
      entry.total++;
      if (attempt.success) entry.correct++;
    }
  }

  return Array.from(byMidi.entries())
    .map(([midi, data]) => ({
      midi,
      noteName: data.noteName,
      label: data.label,
      correct: data.correct,
      total: data.total,
      pct: Number(((data.correct / data.total) * 100).toFixed(1)),
    }))
    .sort((a, b) => a.midi - b.midi); // MIDI asc
}

/**
 * V2: Calcula stats POR ACORDE (polifônico)
 * Agrupa acordes, não notas individuais
 */
function computePerChordStatsV2(attempts: AttemptLog[]): PerChordStatV2[] {
  const byChordKey = new Map<
    string,
    {
      correct: number;
      total: number;
      midiGroup: number[];
      chordName: string;
      noteDetails: Map<number, { correct: number; total: number }>;
    }
  >();

  for (const attempt of attempts) {
    const midiArray = Array.isArray(attempt.midi)
      ? attempt.midi
      : [attempt.midi];

    // Normaliza: sort e cria chave única
    const sortedMidi = [...midiArray].sort((a, b) => a - b);
    const chordKey = sortedMidi.join("-");
    const chordName = getChordName(sortedMidi);

    if (!byChordKey.has(chordKey)) {
      byChordKey.set(chordKey, {
        correct: 0,
        total: 0,
        midiGroup: sortedMidi,
        chordName,
        noteDetails: new Map(),
      });
    }

    const entry = byChordKey.get(chordKey)!;
    entry.total++;
    if (attempt.success) entry.correct++;

    // Breakdown por nota dentro do acorde
    for (const midi of sortedMidi) {
      if (!entry.noteDetails.has(midi)) {
        entry.noteDetails.set(midi, { correct: 0, total: 0 });
      }
      const noteEntry = entry.noteDetails.get(midi)!;
      noteEntry.total++;
      if (attempt.success) noteEntry.correct++;
    }
  }

  return Array.from(byChordKey.entries())
    .map(([_, data]) => ({
      midiGroup: data.midiGroup,
      chordName: data.chordName,
      label: getChordLabel(data.midiGroup), // ex: "Dó Maior"
      correct: data.correct,
      total: data.total,
      pct: Number(((data.correct / data.total) * 100).toFixed(1)),
      notes: Array.from(data.noteDetails.entries()).map(([midi, detail]) => ({
        midi,
        noteName: getMidiNoteName(midi),
        correct: detail.correct,
        total: detail.total,
      })),
    }))
    .sort((a, b) => a.midiGroup[0] - b.midiGroup[0]); // Sort by root MIDI
}

// ============================================================
// HELPERS: MIDI ↔ Nota
// ============================================================

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Converte MIDI number para string (ex: 60 => "C4")
 */
function getMidiNoteName(midi: number): string {
  const octave = Math.floor((midi - 12) / 12);
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Label em português (ex: "G4 (segunda linha)")
 * 📋 TODO: mapeamento customizável por instrumento
 */
function getMidiLabel(midi: number): string {
  const noteName = getMidiNoteName(midi);
  // Placeholder: seria lido de um config do projeto
  // return `${noteName} (${staffPosition(midi)})`;
  return noteName; // For now, just the name
}

// ============================================================
// HELPERS: Acorde
// ============================================================

/**
 * Nome do acorde (ex: [60,64,67] => "C Major")
 * 📋 TODO: logic mais sofisticada de análise de acordes
 */
function getChordName(midiGroup: number[]): string {
  if (midiGroup.length === 1) {
    return getMidiNoteName(midiGroup[0]);
  }

  // Simplificado: root + "chord"
  const rootMidi = midiGroup[0];
  const rootNote = NOTE_NAMES[rootMidi % 12];

  // Detecção básica
  const intervals = midiGroup
    .slice(1)
    .map((m) => (m - rootMidi + 12) % 12);

  if (intervals.includes(4) && intervals.includes(7)) {
    return `${rootNote} Major`;
  } else if (intervals.includes(3) && intervals.includes(7)) {
    return `${rootNote} minor`;
  } else {
    return rootNote + "chord";
  }
}

/**
 * Label em português para acorde (ex: "Dó Maior")
 */
function getChordLabel(midiGroup: number[]): string {
  // Placeholder: seria lido de um config
  return getChordName(midiGroup);
}

// ============================================================
// EVENT DISPATCHER
// ============================================================

/**
 * Listeners que serão chamados quando tarefa termina
 */
const taskCompletionListeners: Set<(result: TaskResultSummary) => void> =
  new Set();

export function onTaskCompleted(callback: (result: TaskResultSummary) => void) {
  taskCompletionListeners.add(callback);
  return () => taskCompletionListeners.delete(callback); // unsubscribe
}

/**
 * DISPARA evento de fim de tarefa
 * Chamado por WAIT e FILM
 */
export function dispatchTaskCompletion(result: TaskResultSummary) {
  console.log("[TaskCompletion] Task finished:", result);
  taskCompletionListeners.forEach((cb) => cb(result));
}

// ============================================================
// INTEGRAÇÃO: O QUE CHAMAR NOS MODOS
// ============================================================

/**
 * Em WaitMode.ts, quando último passo é aprovado:
 * 
 * if (currentStepIndex === totalSteps - 1 && stepApproved) {
 *   const attempts = [...this.attemptLog]; // seu array
 *   const result = computeTaskResult(
 *     attempts,
 *     totalSteps,
 *     "WAIT",
 *     this.lessonId,
 *     this.chapterId,
 *     "V1" // ou "V2"
 *   );
 *   dispatchTaskCompletion(result);
 * }
 */

/**
 * Em FilmMode.ts, quando timeline termina:
 * 
 * if (timeline.ended || playback === 100) {
 *   const attempts = [...this.recordedAttempts];
 *   const result = computeTaskResult(
 *     attempts,
 *     totalSteps,
 *     "FILM",
 *     this.lessonId,
 *     this.chapterId,
 *     "V2" // FILM é sempre polifônico
 *   );
 *   dispatchTaskCompletion(result);
 * }
 */
