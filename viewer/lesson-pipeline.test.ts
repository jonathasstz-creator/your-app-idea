import { describe, it, expect, vi } from 'vitest';
import { parseAndRoute } from './lesson-pipeline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v2Fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'lesson_v2.json'), 'utf-8')
);

describe('lesson-pipeline', () => {
  it('routes V1 payload to pipelineV1', () => {
    const v1Payload = {
      type: 'lesson_content',
      schema_version: 1,
      session_id: 'sess-v1',
      lesson_id: 'lesson-v1',
      lesson_version: 1,
      bpm: 120,
      beats_per_measure: 4,
      count_in_beats: 4,
      total_steps: 1,
      evaluation: { hit_window_ms: 120, late_miss_ms: 500, early_accept_ms: 150 },
      score: { xml_text: '<score-partwise></score-partwise>' },
      notes: [
        { step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }
      ],
    };

    const v1 = vi.fn();
    const v2 = vi.fn();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    parseAndRoute(v1Payload, { pipelineV1: v1, pipelineV2: v2 });

    expect(v1).toHaveBeenCalledOnce();
    expect(v2).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('[v1] lesson_loaded', expect.objectContaining({
      schema_version: 1,
      lesson_id: 'lesson-v1',
    }));

    infoSpy.mockRestore();
  });

  it('routes V2 payload to pipelineV2', () => {
    const v1 = vi.fn();
    const v2 = vi.fn();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    parseAndRoute(v2Fixture, { pipelineV1: v1, pipelineV2: v2 });

    expect(v2).toHaveBeenCalledOnce();
    expect(v1).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('[v2] lesson_loaded', expect.objectContaining({
      schema_version: 2,
      lesson_id: 'lesson-v2-fixture',
    }));

    infoSpy.mockRestore();
  });
});
