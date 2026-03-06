import { validateLessonContent } from './validators';
import { PacketV1, PacketV2, LessonPacketBase, LessonNote, LessonStepV2 } from './types';

type PipelineV1 = (packet: PacketV1) => void;
type PipelineV2 = (packet: PacketV2) => void;

const toNum = (value: unknown, fallback: number) => {
  return Number.isFinite(value as number) ? Number(value) : fallback;
};

export function parseAndRoute(
  raw: unknown,
  options: { pipelineV1: PipelineV1; pipelineV2: PipelineV2 }
): PacketV1 | PacketV2 {
  const validated = validateLessonContent(raw) as any;

  // Heuristic: Auto-detect V2 if steps array exists and has content, 
  // OR if explicitly version 2.
  // This forces legacy lessons with 'steps' prop to be V2.
  const hasSteps = Array.isArray(validated.steps) && validated.steps.length > 0;
  const isExplicitV2 = validated.schema_version === 2;
  const isPolyphonic = hasSteps && validated.steps.some((s: any) => Array.isArray(s.notes) && s.notes.length > 1);

  // Harden V2 detection: check if steps are actually V2-compliant
  const hasValidV2Steps = hasSteps && validated.steps.every((s: any) =>
    s && typeof s.start_beat === 'number' && Array.isArray(s.notes)
  );

  const schemaVersion: 1 | 2 = (isExplicitV2 || hasValidV2Steps) ? 2 : 1;
  const detectionMethod = isExplicitV2 ? 'explicit' : (hasValidV2Steps ? 'inferred_steps' : 'default_v1');

  if (schemaVersion === 2) {
    console.info(`[v2:${isPolyphonic ? 'polyphonic' : 'standard'}] lesson loaded (${detectionMethod})`);
  }

  const base: LessonPacketBase = {
    session_id: String(validated.session_id || ''),
    lesson_id: String(validated.lesson_id || ''),
    chapter_id: validated.chapter_id,
    lesson_version: toNum(validated.lesson_version, 0),
    bpm: toNum(validated.bpm, 120),
    beats_per_measure: toNum(validated.beats_per_measure, 4),
    count_in_beats: toNum(validated.count_in_beats, 0),
    total_steps: toNum(validated.total_steps, 0),
    evaluation: validated.evaluation,
    score: validated.score,
  };

  console.info(`[v${schemaVersion}] lesson_loaded`, {
    schema_version: schemaVersion,
    lesson_id: base.lesson_id,
    chapter_id: base.chapter_id,
  });

  if (schemaVersion === 2) {
    const steps = Array.isArray(validated.steps) ? (validated.steps as LessonStepV2[]) : [];
    const packet: PacketV2 = {
      ...base,
      schema_version: 2,
      content: { steps },
    };
    options.pipelineV2(packet);
    return packet;
  }

  const notes = Array.isArray(validated.notes) ? (validated.notes as LessonNote[]) : [];
  const packet: PacketV1 = {
    ...base,
    schema_version: 1,
    content: { notes },
  };
  options.pipelineV1(packet);
  return packet;
}
