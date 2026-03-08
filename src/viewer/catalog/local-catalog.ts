/**
 * Local Catalog Adapter
 *
 * Reads `assets/lessons.json` and produces a CatalogResponse in the same
 * shape the backend would return. This allows the entire catalog pipeline
 * (CatalogResponse → adaptCatalogToTrails → Trail[]) to work offline.
 *
 * When a real backend is available, this module becomes unnecessary —
 * CatalogService.load(transport) will fetch the same shape from the API.
 */

import lessonsJson from '../../../assets/lessons.json';
import type { BackendCatalogPayload, BackendTrack, BackendChapter } from './adapter';

interface JsonChapter {
  chapter_id: number;
  title?: string;
  subtitle?: string;
  description?: string;
  difficulty?: string;
  allowed_notes?: string[];
  hand?: string;
  skill_tags?: string[];
  badge?: string;
  prerequisites?: number[];
  coming_soon?: boolean;
  default_lesson_id?: string;
}

interface JsonModule {
  id?: string;
  module_id?: string;
  title?: string;
  subtitle?: string;
  hand?: string;
  chapters?: JsonChapter[];
}

interface JsonLevel {
  level_id?: string;
  title?: string;
  feature_flag?: string;
  modules?: JsonModule[];
}

interface JsonTrail {
  trail_id?: string;
  title?: string;
  subtitle?: string;
  feature_flag?: string;
  levels?: JsonLevel[];
}

interface LessonsJson {
  modules?: JsonModule[];
  trails?: JsonTrail[];
}

/**
 * Build a CatalogResponse from the static lessons.json.
 *
 * Mapping:
 *   - Each `module` in `modules[]` → a BackendTrack
 *   - Each `trail.level.module` in `trails[]` → a BackendTrack
 *   - All chapters get a `track_id` pointing to their parent track
 *   - Chapters are ordered sequentially within each track
 */
export function buildLocalCatalog(): BackendCatalogPayload {
  const json = lessonsJson as unknown as LessonsJson;
  const tracks: BackendTrack[] = [];
  const chapters: BackendChapter[] = [];
  let trackOrder = 0;

  // --- Pass 1: legacy modules[] ---
  for (const mod of json.modules ?? []) {
    const trackId = mod.id ?? mod.module_id ?? `mod_${trackOrder}`;
    tracks.push({
      track_id: trackId,
      title: mod.title,
      order: trackOrder++,
    });

    let chOrder = 0;
    for (const ch of mod.chapters ?? []) {
      chapters.push(chapterToBackend(ch, trackId, chOrder++));
    }
  }

  // --- Pass 2: trails[] (new curriculum) ---
  for (const trail of json.trails ?? []) {
    for (const level of trail.levels ?? []) {
      for (const mod of level.modules ?? []) {
        const trackId = mod.module_id ?? mod.id ?? `trail_${trackOrder}`;
        tracks.push({
          track_id: trackId,
          title: [mod.title, mod.subtitle].filter(Boolean).join(' · ') || level.title,
          order: trackOrder++,
        });

        let chOrder = 0;
        for (const ch of mod.chapters ?? []) {
          chapters.push(chapterToBackend(ch, trackId, chOrder++));
        }
      }
    }
  }

  return { tracks, chapters, lessons: [] };
}

function chapterToBackend(ch: JsonChapter, trackId: string | number, order: number): BackendChapter {
  return {
    chapter_id: ch.chapter_id,
    track_id: trackId,
    title: ch.title,
    subtitle: ch.subtitle,
    default_lesson_id: ch.default_lesson_id ?? `lesson_${ch.chapter_id}`,
    order,
    status: ch.coming_soon ? 'coming_soon' : undefined,
    // Extended metadata (passed through to TrailChapter by adapter)
    difficulty: ch.difficulty as any,
    description: ch.description,
    allowed_notes: ch.allowed_notes,
    hand: ch.hand as any,
    skill_tags: ch.skill_tags,
    badge: ch.badge,
    prerequisites: ch.prerequisites,
    coming_soon: ch.coming_soon,
  } as BackendChapter;
}
