/**
 * Progress Index — Pure function to build chapter stats from localStorage.
 *
 * Reads existing localStorage keys (hs_, sc_) written by taskCompletion service
 * and builds a Map<number, ChapterStats> for the TrailNavigator UI.
 *
 * Design:
 * - Pure function, no side effects (reads only)
 * - Accepts optional storage parameter for testability
 * - Local-first: works 100% offline
 * - Compatible with future transport/backend enrichment
 */

export interface ChapterStats {
  unlocked: boolean;
  progress_pct: number;
}

const MODES = ["wait", "film"] as const;

/**
 * Build a stats index from localStorage progress data.
 *
 * For each chapterId, scans for known localStorage keys:
 *   - `sc_lesson_{id}_{id}_{mode}` — session count
 *   - `hs_lesson_{id}_{id}_{mode}` — high score
 *
 * Rules:
 *   - sessionCount > 0 AND highScore > 0 → progress_pct = 100 (completed)
 *   - sessionCount > 0 AND highScore = 0 → progress_pct = 50 (attempted)
 *   - no data → not included in the map
 */
export function buildStatsIndex(
  chapterIds: number[],
  storage: Pick<Storage, "getItem"> = localStorage
): Map<number, ChapterStats> {
  const result = new Map<number, ChapterStats>();

  for (const chapterId of chapterIds) {
    const lessonId = `lesson_${chapterId}`;
    let bestSessionCount = 0;
    let bestHighScore = 0;

    for (const mode of MODES) {
      const scKey = `sc_${lessonId}_${chapterId}_${mode}`;
      const hsKey = `hs_${lessonId}_${chapterId}_${mode}`;

      const scRaw = storage.getItem(scKey);
      const hsRaw = storage.getItem(hsKey);

      const sc = safeParseInt(scRaw);
      const hs = safeParseInt(hsRaw);

      if (sc > bestSessionCount) bestSessionCount = sc;
      if (hs > bestHighScore) bestHighScore = hs;
    }

    if (bestSessionCount > 0 || bestHighScore > 0) {
      result.set(chapterId, {
        unlocked: true,
        progress_pct: bestHighScore > 0 ? 100 : 50,
      });
    }
  }

  return result;
}

function safeParseInt(raw: string | null): number {
  if (raw === null) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
