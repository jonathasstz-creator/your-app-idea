/**
 * CatalogService — Unit Tests
 *
 * Tests caching, chapter-lesson mapping, normalizeChapterKey, and trail indexing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the lessons.json import
vi.mock("../../../assets/lessons.json", () => ({
  default: {
    trails: [
      {
        trail_id: "beginner",
        levels: [
          {
            modules: [
              {
                chapters: [
                  { chapter_id: 101, title: "Intro", lessons: ["lesson_101"] },
                  { chapter_id: 102, title: "Basics", lessons: ["lesson_102"] },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}));

import { CatalogService, CatalogResponse } from "../catalog-service";

const makeMockTransport = (response: CatalogResponse) => ({
  getCatalog: vi.fn().mockResolvedValue(response),
  startSession: vi.fn(),
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
});

describe("CatalogService", () => {
  let service: CatalogService;

  beforeEach(() => {
    service = new CatalogService();
  });

  describe("getTrails()", () => {
    it("returns trails from lessons.json", () => {
      const trails = service.getTrails();
      expect(trails).toHaveLength(1);
      expect(trails[0].trail_id).toBe("beginner");
    });
  });

  describe("getTrailChapter()", () => {
    it("returns indexed trail chapter by ID", () => {
      const ch = service.getTrailChapter(101);
      expect(ch).toBeDefined();
      expect(ch?.title).toBe("Intro");
    });

    it("returns undefined for non-existent chapter", () => {
      expect(service.getTrailChapter(999)).toBeUndefined();
    });
  });

  describe("load() — caching", () => {
    it("caches catalog after first load", async () => {
      const catalog: CatalogResponse = {
        chapters: [{ chapter_id: 1, default_lesson_id: "les_1" }],
        lessons: [],
      };
      const transport = makeMockTransport(catalog);

      await service.load(transport as any);
      await service.load(transport as any);

      // getCatalog should only be called once (cached)
      expect(transport.getCatalog).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent loads", async () => {
      const catalog: CatalogResponse = { chapters: [], lessons: [] };
      const transport = makeMockTransport(catalog);

      const [r1, r2] = await Promise.all([
        service.load(transport as any),
        service.load(transport as any),
      ]);

      expect(transport.getCatalog).toHaveBeenCalledOnce();
      expect(r1).toBe(r2);
    });
  });

  describe("getChapterLessonId()", () => {
    it("maps chapter to default_lesson_id", async () => {
      const catalog: CatalogResponse = {
        chapters: [{ chapter_id: 5, default_lesson_id: "lesson_five" }],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      expect(service.getChapterLessonId(5)).toBe("lesson_five");
    });

    it("falls back to lessons array when chapter has no default", async () => {
      const catalog: CatalogResponse = {
        chapters: [{ chapter_id: 3 }], // no default_lesson_id
        lessons: [{ lesson_id: "les_3", chapter_id: 3 }],
      };
      await service.load(makeMockTransport(catalog) as any);

      expect(service.getChapterLessonId(3)).toBe("les_3");
    });

    it("handles string chapter IDs (normalizes to number)", async () => {
      const catalog: CatalogResponse = {
        chapters: [{ chapter_id: "7", default_lesson_id: "lesson_7" }],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      expect(service.getChapterLessonId("7")).toBe("lesson_7");
      expect(service.getChapterLessonId(7)).toBe("lesson_7");
    });

    it("trail chapters (100+) auto-map to lesson_{id}", () => {
      // No catalog loaded — trail chapters should still resolve
      expect(service.getChapterLessonId(101)).toBe("lesson_101");
      expect(service.getChapterLessonId(150)).toBe("lesson_150");
    });

    it("returns null for unknown non-trail chapter", () => {
      expect(service.getChapterLessonId(99)).toBeNull();
    });
  });

  describe("clear()", () => {
    it("clears cache and allows re-fetch", async () => {
      const catalog: CatalogResponse = { chapters: [], lessons: [] };
      const transport = makeMockTransport(catalog);

      await service.load(transport as any);
      service.clear();
      await service.load(transport as any);

      expect(transport.getCatalog).toHaveBeenCalledTimes(2);
    });
  });

  describe("isReady() / isLoading()", () => {
    it("isReady is false before load", () => {
      expect(service.isReady()).toBe(false);
    });

    it("isReady is true after load", async () => {
      await service.load(makeMockTransport({ chapters: [], lessons: [] }) as any);
      expect(service.isReady()).toBe(true);
    });
  });
});
