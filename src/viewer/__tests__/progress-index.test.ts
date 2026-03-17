/**
 * TDD: Progress Index — buildStatsIndex
 *
 * Tests for the pure function that reads localStorage progress keys
 * and builds a Map<number, ChapterStats> for the TrailNavigator.
 *
 * Written BEFORE implementation per project TDD policy.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildStatsIndex,
  type ChapterStats,
} from "../progress-index";

// Helper: simulate localStorage entries for a chapter completion
function seedProgress(
  storage: Storage,
  chapterId: number,
  opts: {
    lessonId?: string;
    mode?: string;
    highScore?: number;
    sessionCount?: number;
  } = {}
) {
  const lesson = opts.lessonId ?? `lesson_${chapterId}`;
  const mode = opts.mode ?? "WAIT";
  const hs = opts.highScore ?? 80;
  const sc = opts.sessionCount ?? 1;
  storage.setItem(`hs_${lesson}_${chapterId}_${mode}`.toLowerCase(), String(hs));
  storage.setItem(`sc_${lesson}_${chapterId}_${mode}`.toLowerCase(), String(sc));
}

describe("buildStatsIndex", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Bloco A: unidade pura ──

  it("returns empty map when no progress data exists", () => {
    const index = buildStatsIndex([1, 2, 3]);
    expect(index.size).toBe(0);
  });

  it("marks chapter as completed (100%) when session count > 0 and high score > 0", () => {
    seedProgress(localStorage, 101, { highScore: 90, sessionCount: 2 });
    const index = buildStatsIndex([101]);
    const stats = index.get(101);
    expect(stats).toBeDefined();
    expect(stats!.unlocked).toBe(true);
    expect(stats!.progress_pct).toBe(100);
  });

  it("marks chapter with session but score 0 as attempted (progress > 0 but < 100)", () => {
    seedProgress(localStorage, 102, { highScore: 0, sessionCount: 1 });
    const index = buildStatsIndex([102]);
    const stats = index.get(102);
    expect(stats).toBeDefined();
    expect(stats!.progress_pct).toBeGreaterThan(0);
    expect(stats!.progress_pct).toBeLessThan(100);
  });

  it("does not break with unknown chapter ids (not in localStorage)", () => {
    seedProgress(localStorage, 101);
    const index = buildStatsIndex([101, 999, 888]);
    expect(index.has(101)).toBe(true);
    expect(index.has(999)).toBe(false);
    expect(index.has(888)).toBe(false);
  });

  it("handles multiple chapters independently", () => {
    seedProgress(localStorage, 101, { highScore: 95 });
    seedProgress(localStorage, 102, { highScore: 60 });
    const index = buildStatsIndex([101, 102, 103]);
    expect(index.get(101)?.progress_pct).toBe(100);
    expect(index.get(102)?.progress_pct).toBe(100);
    expect(index.has(103)).toBe(false);
  });

  it("reads WAIT and FILM modes and picks best evidence", () => {
    // Only FILM mode has data
    const lesson = "lesson_105";
    localStorage.setItem(`hs_${lesson}_105_film`, "70");
    localStorage.setItem(`sc_${lesson}_105_film`, "3");
    const index = buildStatsIndex([105]);
    expect(index.get(105)?.progress_pct).toBe(100);
  });

  it("handles corrupted/non-numeric localStorage values gracefully", () => {
    localStorage.setItem("hs_lesson_101_101_wait", "not-a-number");
    localStorage.setItem("sc_lesson_101_101_wait", "{}");
    const index = buildStatsIndex([101]);
    // Should not crash, should return no entry or safe default
    expect(() => buildStatsIndex([101])).not.toThrow();
  });

  it("accepts custom storage parameter for testability", () => {
    const fakeStorage = new Map<string, string>();
    fakeStorage.set("hs_lesson_101_101_wait", "50");
    fakeStorage.set("sc_lesson_101_101_wait", "1");
    // Wrap as Storage-like
    const storageAdapter: Pick<Storage, "getItem"> = {
      getItem: (key: string) => fakeStorage.get(key) ?? null,
    };
    const index = buildStatsIndex([101], storageAdapter as Storage);
    expect(index.get(101)?.progress_pct).toBe(100);
  });

  // ── Bloco C: anti-regressão ──

  /**
   * ANTI-REGRESSÃO: statsIndex vazio fazia o hub parecer "sem progresso"
   * mesmo quando localStorage tinha dados de completion.
   *
   * Este teste garante que, se existirem chaves hs_/sc_ no localStorage
   * para um chapter, o buildStatsIndex retorna um entry real, não vazio.
   */
  it("regression: does not return empty index when localStorage has progress data", () => {
    seedProgress(localStorage, 101, { highScore: 85, sessionCount: 3 });
    seedProgress(localStorage, 102, { highScore: 42, sessionCount: 1 });
    const index = buildStatsIndex([101, 102]);
    expect(index.size).toBeGreaterThanOrEqual(2);
    expect(index.get(101)?.progress_pct).toBeGreaterThan(0);
    expect(index.get(102)?.progress_pct).toBeGreaterThan(0);
  });

  /**
   * ANTI-REGRESSÃO: chapter IDs não encontrados no localStorage
   * não devem quebrar a agregação nem fazer os que existem sumirem.
   *
   * Bug original: um Map.get() em ID inexistente causava undefined propagation
   * que fazia o módulo inteiro desaparecer.
   */
  it("regression: unknown chapter ids do not break aggregation of known ones", () => {
    seedProgress(localStorage, 101, { highScore: 90 });
    const index = buildStatsIndex([101, 9999, -1, 0]);
    expect(index.get(101)).toBeDefined();
    expect(index.get(101)!.progress_pct).toBe(100);
    // Unknown IDs simply absent, no crash
    expect(index.has(9999)).toBe(false);
    expect(index.has(-1)).toBe(false);
    expect(index.has(0)).toBe(false);
  });
});
