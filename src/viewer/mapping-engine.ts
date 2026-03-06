
import { extractMidiFromOsmdNote, isRestNote, extractStaffFromEntry, extractMeasureIndex, extractBeatIndex, normalizeStaffName } from './note-extractor';
import { normalizeBeat, isNumber, toNum } from './utils';
import { LessonNote, LessonStepV2 } from './types';

export function buildV1CursorMapping(osmd: any, lessonNotes: LessonNote[]) {
  if (!osmd || !lessonNotes.length) return [];

  const cursor = osmd.cursor;
  const posBySignature = new Map<string, number>();
  const linearPositions: number[] = [];

  // 1. Escanear a partitura e criar assinaturas de cada nota visual
  cursor.reset();
  cursor.show?.();
  let pIdx = 0;
  while (!cursor.Iterator.EndReached && pIdx < 5000) {
    linearPositions.push(pIdx);

    const entries = cursor.Iterator.CurrentVoiceEntries || [];
    entries.forEach((entry: any) => {
      const staffEntry = entry.SourceStaffEntry || entry.sourceStaffEntry;
      const staff = extractStaffFromEntry(staffEntry, cursor.Iterator);
      const mIdx = extractMeasureIndex(staffEntry, cursor.Iterator);
      const beat = extractBeatIndex(staffEntry);

      (entry.Notes || entry.notes || []).forEach((note: any) => {
        if (isRestNote(note)) return;
        const midi = extractMidiFromOsmdNote(note);
        if (isNumber(midi)) {
          // Assinatura completa: Pentagrama | Compasso | Tempo | Nota
          const sig = `${staff}|${mIdx}|${beat}|${midi}`;
          if (!posBySignature.has(sig)) posBySignature.set(sig, pIdx);

          // Assinatura geográfica: Pentagrama | Compasso | Tempo
          const geoSig = `${staff}|${mIdx}|${beat}`;
          if (!posBySignature.has(geoSig)) posBySignature.set(geoSig, pIdx);
        }
      });
    });
    cursor.next();
    pIdx++;
  }
  cursor.reset();

  // 2. Mapear cada nota da lição (JSON) para uma posição no cursor (Visual)
  const mapping = lessonNotes.map((note, i) => {
    const staff = normalizeStaffName(note.staff);
    const mIdx = toNum(note.measure_index) || 0;
    const beat = normalizeBeat(note.beat) || 0;
    const midi = note.midi;

    const sig = `${staff}|${mIdx}|${beat}|${midi}`;
    const geoSig = `${staff}|${mIdx}|${beat}`;

    // Tenta primeiro assinatura exata, depois geográfica, e por fim o índice linear
    let pos = posBySignature.get(sig) ?? posBySignature.get(geoSig);

    if (!isNumber(pos)) {
      // Se não achou por assinatura, usa o índice linear (1 nota visual por 1 nota da lição)
      pos = linearPositions[Math.min(i, linearPositions.length - 1)] || 0;
    }
    return pos;
  });

  console.log(`[Mapping V1] ${lessonNotes.length} notas mapeadas para ${linearPositions.length} posições visuais.`);
  return mapping;
}

export function buildV2StepToCursorMapping(osmd: any, steps: LessonStepV2[]): number[] {
  if (!osmd || !steps.length) return [];

  const cursor = osmd.cursor;
  const linearPositions: number[] = [];

  cursor.reset();
  cursor.show?.();
  let pIdx = 0;
  while (!cursor.Iterator.EndReached && pIdx < 5000) {
    linearPositions.push(pIdx);

    cursor.next();
    pIdx++;
  }
  cursor.reset();

  const mapping = steps.map((step, i) => {
    // V2 mapping is linear by step index to avoid relying on V1 note metadata.
    const idx = Number.isFinite(step?.step_index) ? Math.max(0, Number(step.step_index)) : i;
    return linearPositions[Math.min(idx, linearPositions.length - 1)] || 0;
  });

  console.log(`[Mapping V2] ${steps.length} steps mapped to ${linearPositions.length} cursor positions.`);
  return mapping;
}

// Backward-compatible alias for legacy files
export const buildStepToCursorMapping = buildV1CursorMapping;
