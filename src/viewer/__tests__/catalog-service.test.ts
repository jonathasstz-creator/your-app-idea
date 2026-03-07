/**
 * CatalogService — Unit Tests
 *
 * Tests caching, chapter-lesson mapping, and backend-driven trail building.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
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

  describe("getTrails() — backend-driven", () => {
    it("returns empty before catalog is loaded", () => {
      expect(service.getTrails()).toEqual([]);
    });

    it("returns trails derived from backend catalog after load", async () => {
      const catalog: CatalogResponse = {
        tracks: [
          { track_id: "beginner", title: "Iniciante", order: 1 },
        ],
        chapters: [
          { chapter_id: 31, track_id: "beginner", title: "Acordes I", order: 1 },
          { chapter_id: 32, track_id: "beginner", title: "Acordes II", order: 2 },
        ],
        lessons: [
          { lesson_id: "lesson_31", chapter_id: 31 },
          { lesson_id: "lesson_32", chapter_id: 32 },
        ],
      };
      await service.load(makeMockTransport(catalog) as any);

      const trails = service.getTrails();
      expect(trails).toHaveLength(1);
      expect(trails[0].title).toBe("Iniciante");

      const chapters = trails[0].levels?.[0]?.modules?.[0]?.chapters;
      expect(chapters).toHaveLength(2);
      expect(chapters![0].chapter_id).toBe(31);
      expect(chapters![1].chapter_id).toBe(32);
    });

    it("groups orphan chapters into 'Outros' trail", async () => {
      const catalog: CatalogResponse = {
        tracks: [],
        chapters: [
          { chapter_id: 99, title: "Sandbox" },
        ],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      const trails = service.getTrails();
      expect(trails).toHaveLength(1);
      expect(trails[0].trail_id).toBe("_other");
    });

    it("attaches multiple lessons to upload chapters", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "uploads", title: "Uploads", order: 1 }],
        chapters: [
          { chapter_id: 50, track_id: "uploads", title: "Minhas Músicas", order: 1 },
        ],
        lessons: [
          { lesson_id: "upload_1", chapter_id: 50, title: "Música A" },
          { lesson_id: "upload_2", chapter_id: 50, title: "Música B" },
        ],
      };
      await service.load(makeMockTransport(catalog) as any);

      const ch = service.getTrailChapter(50);
      expect(ch).toBeDefined();
      expect(ch?.lessons).toHaveLength(2);
      expect(ch?.lessons![0].lesson_id).toBe("upload_1");
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
        chapters: [{ chapter_id: 3 }],
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

    it("special chapters auto-map to lesson_{id}", () => {
      expect(service.getChapterLessonId(4)).toBe("lesson_4");
      expect(service.getChapterLessonId(23)).toBe("lesson_23");
      expect(service.getChapterLessonId(31)).toBe("lesson_31");
      expect(service.getChapterLessonId(45)).toBe("lesson_45");
      expect(service.getChapterLessonId(99)).toBe("lesson_99");
      expect(service.getChapterLessonId(101)).toBe("lesson_101");
      expect(service.getChapterLessonId(150)).toBe("lesson_150");
    });

    it("returns null for non-special chapters without catalog", () => {
      expect(service.getChapterLessonId(3)).toBeNull();
      expect(service.getChapterLessonId(5)).toBeNull();
      expect(service.getChapterLessonId(22)).toBeNull();
      expect(service.getChapterLessonId(24)).toBeNull();
      expect(service.getChapterLessonId(46)).toBeNull();
      expect(service.getChapterLessonId(98)).toBeNull();
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

    it("clears trails on clear()", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t1", title: "T1" }],
        chapters: [{ chapter_id: 1, track_id: "t1", title: "Ch1" }],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);
      expect(service.getTrails()).toHaveLength(1);

      service.clear();
      expect(service.getTrails()).toEqual([]);
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
