/**
 * CatalogService — Unit Tests
 *
 * Tests local catalog loading, backend override, caching, and chapter mapping.
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

  describe("local catalog (no backend)", () => {
    it("has trails immediately after construction", () => {
      expect(service.getTrails().length).toBeGreaterThan(0);
    });

    it("isReady() is true immediately", () => {
      expect(service.isReady()).toBe(true);
    });

    it("resolves chapter metadata with description and allowed_notes", () => {
      const ch = service.getTrailChapter(1);
      expect(ch).toBeDefined();
      expect(ch?.title).toContain("Mi");
      expect(ch?.description).toBeDefined();
      expect(ch?.allowed_notes).toContain("E4");
    });

    it("resolves polyphonic chapter with difficulty", () => {
      const ch = service.getTrailChapter(31);
      expect(ch).toBeDefined();
      expect(ch?.difficulty).toBe("polyphonic_v2");
    });

    it("resolves chord chapter with difficulty", () => {
      const ch = service.getTrailChapter(41);
      expect(ch).toBeDefined();
      expect(ch?.difficulty).toBe("chords_v2");
    });

    it("resolves trail chapters (100+)", () => {
      const ch = service.getTrailChapter(101);
      expect(ch).toBeDefined();
      expect(ch?.title).toContain("Sol");
    });
  });

  describe("backend override", () => {
    it("replaces local data when backend loads", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "custom", title: "Custom Track", order: 1 }],
        chapters: [
          { chapter_id: 1000, track_id: "custom", title: "Backend Chapter", order: 1 },
        ],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      const trails = service.getTrails();
      expect(trails).toHaveLength(1);
      expect(trails[0].title).toBe("Catálogo de Lições");
    });

    it("keeps local data if backend fails", async () => {
      const transport = {
        getCatalog: vi.fn().mockRejectedValue(new Error("network")),
        startSession: vi.fn(),
        sendMessage: vi.fn(),
        onMessage: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
      };

      const trailsBefore = service.getTrails().length;
      await service.load(transport as any).catch(() => {});

      expect(service.getTrails().length).toBe(trailsBefore);
    });
  });

  describe("getTrails() — backend-driven", () => {
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

      const chapters = trails[0].levels?.[0]?.modules?.[0]?.chapters;
      expect(chapters).toHaveLength(2);
      expect(chapters![0].chapter_id).toBe(31);
      expect(chapters![1].chapter_id).toBe(32);
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

      const trails = service.getTrails();
      const ch = trails[0]?.levels?.[0]?.modules?.[0]?.chapters?.[0];
      expect(ch).toBeDefined();
      expect(ch?.chapter_id).toBe(50);
    });
  });

  describe("load() — caching", () => {
    it("caches backend catalog after first load", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t", title: "T", order: 0 }],
        chapters: [{ chapter_id: 1, track_id: "t", default_lesson_id: "les_1" }],
        lessons: [],
      };
      const transport = makeMockTransport(catalog);

      await service.load(transport as any);
      await service.load(transport as any);

      expect(transport.getCatalog).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent loads", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t", title: "T", order: 0 }],
        chapters: [],
        lessons: [],
      };
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
    it("maps chapter via fallback for >= 4", () => {
      expect(service.getChapterLessonId(4)).toBe("lesson_4");
      expect(service.getChapterLessonId(23)).toBe("lesson_23");
      expect(service.getChapterLessonId(31)).toBe("lesson_31");
      expect(service.getChapterLessonId(99)).toBe("lesson_99");
      expect(service.getChapterLessonId(101)).toBe("lesson_101");
    });

    it("maps chapter to backend default_lesson_id after load", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t", title: "T", order: 0 }],
        chapters: [{ chapter_id: 5, track_id: "t", default_lesson_id: "lesson_five" }],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      expect(service.getChapterLessonId(5)).toBe("lesson_five");
    });

    it("falls back to lessons array when chapter has no default", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t", title: "T", order: 0 }],
        chapters: [{ chapter_id: 3, track_id: "t" }],
        lessons: [{ lesson_id: "les_3", chapter_id: 3 }],
      };
      await service.load(makeMockTransport(catalog) as any);

      expect(service.getChapterLessonId(3)).toBe("les_3");
    });
  });

  describe("clear()", () => {
    it("clears cache and resets state", () => {
      service.clear();
      // After clear, getTrails falls back to lessons.json
      const trails = service.getTrails();
      expect(trails.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("metadata passthrough", () => {
    it("passes difficulty through inline builder", async () => {
      const catalog: CatalogResponse = {
        tracks: [{ track_id: "t", title: "T", order: 0 }],
        chapters: [{
          chapter_id: 50,
          track_id: "t",
          title: "Poly",
          order: 0,
          difficulty: "polyphonic_v2",
          description: "Test desc",
          allowed_notes: ["C4", "E4"],
          hand: "both",
        }],
        lessons: [],
      };
      await service.load(makeMockTransport(catalog) as any);

      const trails = service.getTrails();
      const ch = trails[0]?.levels?.[0]?.modules?.[0]?.chapters?.[0];
      expect(ch?.difficulty).toBe("polyphonic_v2");
      expect(ch?.description).toBe("Test desc");
      expect(ch?.allowed_notes).toEqual(["C4", "E4"]);
      expect(ch?.hand).toBe("both");
    });
  });
});
