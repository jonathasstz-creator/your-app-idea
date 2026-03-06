// beat-to-x-mapping.ts - CORRIGIDO/FINAL

import { OsmdController } from "./osmd-controller";
import { extractMidiFromOsmdNote, isRestNote, extractMeasureIndex, extractBeatIndex } from "./note-extractor";
import { buildDynamicBeatToXMapping } from "./measure-density";

export interface BeatToXEntry {
    beat: number;
    x: number;
}

const DEFAULT_PPB = 90;
const EPSILON = 1e-4;
/** Pixels: x "going back" more than this = system line break, do not interpolate across */
const LINE_BREAK_THRESHOLD = 100;
/** Max cursor advances per step to avoid infinite loop if OSMD timestamp never reaches step beat */
const MAX_ADVANCE_PER_STEP = 10000;
/** Max cursor advances to consume same-beat entries (multiple voices/staves) */
const MAX_SAME_BEAT_ADVANCES = 500;
const MIN_MATCH_RATIO = 0.8;
const MIN_MATCHED_NOTES = 3;

// Schema V1: notas individuais
interface LessonNoteV1 {
    targetBeat: number;
    midi: number;
}

// Schema V2: steps com múltiplas notas
interface LessonStepV2 {
    start_beat: number;
    duration_beats?: number;
    notes: number[]; // MIDI array (chord)
}

interface V2MappingOptions {
    beatsPerMeasure?: number;
    basePxPerBeat?: number;
    enableDynamic?: boolean;
}

/**
 * Build beat→x mapping for SCHEMA V1 (monophonic)
 */
export function buildBeatToXMappingV1(
    osmdCtrl: OsmdController,
    lessonNotes: LessonNoteV1[]
): BeatToXEntry[] {
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) {
        console.warn('[buildBeatToXMapping:V1] OSMD cursor not available');
        return [];
    }

    const mapping: BeatToXEntry[] = [];
    const cursor = osmd.cursor;

    try {
        cursor.reset();
        cursor.show();

        const sortedNotes = [...lessonNotes].sort((a, b) => a.targetBeat - b.targetBeat);
        console.log('[buildBeatToXMapping:V1] Starting cursor scan for', sortedNotes.length, 'notes');

        for (let i = 0; i < sortedNotes.length; i++) {
            const note = sortedNotes[i];

            const cursorElement = cursor.cursorElement || cursor.CursorElement;
            if (cursorElement) {
                const x = getCursorXPosition(cursorElement, osmd.container);
                mapping.push({
                    beat: note.targetBeat,
                    x: x
                });
            }

            if (cursor.Iterator.EndReached) {
                console.warn('[buildBeatToXMapping:V1] EndReached after capture');
                break;
            }

            // Avança cursor para próxima nota
            if (i < sortedNotes.length - 1) {
                cursor.next();
            }
        }

        const finalized = finalizeMapping(mapping);

        cursor.hide();
        cursor.reset();

        console.log(`[buildBeatToXMapping:V1] Created ${finalized.length} entries from ${sortedNotes.length} notes`);
        return finalized;

    } catch (e) {
        console.error('[buildBeatToXMapping:V1] Error:', e);
        cursor.hide();
        cursor.reset();
        return [];
    }
}

/**
 * Build beat→x mapping for SCHEMA V2 (polyphonic)
 * CRITICAL: One mapping entry per STEP (not per note).
 * Cursor is advanced by iterator timestamp so we align to the real beat (handles multiple voices/staves per beat).
 */
export function buildBeatToXMappingV2(
    osmdCtrl: OsmdController,
    lessonSteps: LessonStepV2[],
    options?: V2MappingOptions
): BeatToXEntry[] {
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) {
        console.warn('[buildBeatToXMapping:V2] OSMD cursor not available');
        return [];
    }

    const beatsPerMeasure = options?.beatsPerMeasure ?? 4;
    const basePxPerBeat = options?.basePxPerBeat ?? DEFAULT_PPB;
    const enableDynamic = options?.enableDynamic ?? true;

    const mapping: BeatToXEntry[] = [];
    const cursor = osmd.cursor;

    try {
        cursor.reset();
        cursor.show();

        const sortedSteps = [...lessonSteps].sort((a, b) => a.start_beat - b.start_beat);
        console.log('[buildBeatToXMapping:V2] Starting content-based cursor scan for', sortedSteps.length, 'steps');

        let stepIdx = 0;
        let matchedCount = 0;
        let pIdx = 0;
        const LIMIT = 10000; // Safety break

        while (!cursor.Iterator.EndReached && stepIdx < sortedSteps.length && pIdx < LIMIT) {
            const step = sortedSteps[stepIdx];

            // Get visual midis at current position
            const entries = cursor.Iterator.CurrentVoiceEntries;
            const currentMidis: number[] = [];

            if (entries) {
                for (const entry of entries) {
                    const notes = entry.Notes || entry.notes || [];
                    for (const note of notes) {
                        if (isRestNote(note)) continue;
                        const m = extractMidiFromOsmdNote(note);
                        if (m !== null) currentMidis.push(m);
                    }
                }
            }

            // Check if current visual notes overlap with step notes (tolerant match)
            // If at least one note matches, we assume this visual event corresponds to the step.
            // This handles partial rendering or different voicings.
            const hasMatch = step.notes.some(stepMidi =>
                currentMidis.includes(Math.round(stepMidi))
            );

            if (hasMatch) {
                const cursorElement = cursor.cursorElement || cursor.CursorElement;
                if (cursorElement) {
                    const x = getCursorXPosition(cursorElement, osmd.container);
                    mapping.push({
                        beat: step.start_beat,
                        x: x
                    });
                }

                // Advance to next step, but STAY on this cursor position if multiple steps map here (unlikely for piano but safer)
                // Actually, piano steps are distinct in time. If we matched, we consumed this step.
                // Should we consume the cursor? Yes, usually.
                stepIdx++;
                matchedCount++;
            }

            // Always advance cursor to search forward
            // Note: If we missed a step (e.g. not rendered), we might skip it. 
            // This loop naturally skips visual elements that aren't in the lesson (e.g. extra rests).
            cursor.next();
            pIdx++;
        }

        if (stepIdx < sortedSteps.length) {
            console.warn(`[buildBeatToXMapping:V2] Partial mapping: matched ${stepIdx}/${sortedSteps.length} steps`);
        }

        const finalized = finalizeMapping(mapping);
        const matchRatio = sortedSteps.length > 0 ? (matchedCount / sortedSteps.length) : 0;
        const isMatchReliable = matchRatio >= MIN_MATCH_RATIO && matchedCount >= MIN_MATCHED_NOTES;

        cursor.hide();
        cursor.reset();

        if (!isMatchReliable) {
            console.warn('[buildBeatToXMapping:V2] Low match reliability, trying fallbacks', {
                matchRatio: Number(matchRatio.toFixed(2)),
                matchedCount,
                totalSteps: sortedSteps.length
            });
            
            // TENTATIVA 1: Full scan do cursor OSMD (melhor opção - posições reais)
            const timeBased = buildBeatToXMappingV2ByTime(osmdCtrl, sortedSteps, beatsPerMeasure);
            if (timeBased.length > 0) {
                console.log(`[buildBeatToXMapping:V2] ✅ Using OSMD cursor scan: ${timeBased.length} entries`);
                return timeBased;
            }

            // TENTATIVA 2: Dynamic mapping sintético (último recurso)
            if (enableDynamic) {
                console.warn('[buildBeatToXMapping:V2] OSMD scan failed, using DYNAMIC fallback (may have scroll drift)');
                const dynamic = buildDynamicBeatToXMapping(sortedSteps, beatsPerMeasure, basePxPerBeat);
                console.log(`[buildBeatToXMapping:V2] Dynamic mapping produced ${dynamic.length} entries`);
                return dynamic;
            }

            console.warn('[buildBeatToXMapping:V2] ⚠️ All fallbacks failed; using best-effort mapping');
        }

        console.log(`[buildBeatToXMapping:V2] Created ${finalized.length} entries from ${sortedSteps.length} steps`);
        return finalized;

    } catch (e) {
        console.error('[buildBeatToXMapping:V2] Error:', e);
        cursor.hide();
        cursor.reset();
        return [];
    }
}

/**
 * Helper: Get cursor X position relative to container
 */
function getCursorXPosition(cursorElement: HTMLElement, container: HTMLElement | null | undefined): number {
    const rect = cursorElement.getBoundingClientRect();
    if (!container) return rect.left;
    const containerRect = container.getBoundingClientRect();
    return rect.left - containerRect.left + (container.scrollLeft || 0);
}

function buildBeatToXMappingV2ByTime(
    osmdCtrl: OsmdController,
    sortedSteps: LessonStepV2[],
    beatsPerMeasure: number
): BeatToXEntry[] {
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) return [];

    const cursor = osmd.cursor;
    const iterator = (cursor as any).Iterator ?? (cursor as any).iterator;
    
    /**
     * Extrai beat absoluto usando múltiplas estratégias
     * CRÍTICO: Esta função precisa retornar valores CRESCENTES à medida que o cursor avança
     */
    const getAbsBeat = (): number | null => {
        // Tentativa 1: Usar VoiceEntries para extrair measure/beat via SourceStaffEntry
        const entries = iterator?.CurrentVoiceEntries ?? iterator?.currentVoiceEntries ?? [];
        
        for (const entry of entries) {
            const staffEntry = entry?.SourceStaffEntry ?? entry?.sourceStaffEntry;
            if (!staffEntry) continue;
            
            const mIdx = extractMeasureIndex(staffEntry, iterator);
            const bIdx = extractBeatIndex(staffEntry);
            
            if (Number.isFinite(mIdx) && Number.isFinite(bIdx)) {
                return (mIdx * beatsPerMeasure) + bIdx;
            }
        }
        
        // Tentativa 2: currentTimeStamp direto do iterator
        const ts = iterator?.currentTimeStamp;
        if (ts) {
            const beatInMeasure = ts.RealValue ?? ts.realValue;
            if (typeof beatInMeasure === 'number' && Number.isFinite(beatInMeasure)) {
                // Tentar obter measure index
                let mIdx = iterator?.CurrentMeasureIndex ?? iterator?.currentMeasureIndex;
                
                if (!Number.isFinite(mIdx) && iterator?.CurrentMeasure) {
                    const measureNum = iterator.CurrentMeasure?.MeasureNumber ?? 
                                      iterator.CurrentMeasure?.measureNumber;
                    if (Number.isFinite(measureNum)) {
                        mIdx = measureNum - 1;
                    }
                }
                
                if (Number.isFinite(mIdx) && mIdx >= 0) {
                    return (mIdx * beatsPerMeasure) + beatInMeasure;
                }
                return beatInMeasure;
            }
        }
        
        // Tentativa 3: Extrair de AbsoluteTimestamp
        const absTs = iterator?.AbsoluteTimestamp ?? iterator?.absoluteTimestamp;
        if (absTs) {
            const absBeat = absTs.RealValue ?? absTs.realValue;
            if (typeof absBeat === 'number' && Number.isFinite(absBeat)) {
                return absBeat;
            }
        }
        
        return null;
    };

    // MÉTODO 1: Scan completo de TODAS as posições do cursor (não só os steps)
    const fullScanMapping = buildFullCursorScan(osmdCtrl, getAbsBeat, sortedSteps);
    if (fullScanMapping.length >= 5) {
        console.log(`[buildBeatToXMapping:V2ByTime] Full scan produced ${fullScanMapping.length} entries`);
        return finalizeMapping(fullScanMapping);
    }
    
    // MÉTODO 2: Scan por steps (fallback antigo, mais lento)
    const mapping: BeatToXEntry[] = [];
    const LIMIT = 10000;
    let stepIdx = 0;
    let pIdx = 0;

    try {
        cursor.reset();
        cursor.show();

        while (!Boolean(iterator?.EndReached ?? iterator?.endReached) && stepIdx < sortedSteps.length && pIdx < LIMIT) {
            const step = sortedSteps[stepIdx];
            const cursorBeat = getAbsBeat();

            if (cursorBeat !== null && cursorBeat + EPSILON >= step.start_beat) {
                const cursorElement = cursor.cursorElement || cursor.CursorElement;
                if (cursorElement) {
                    const x = getCursorXPosition(cursorElement, osmd.container);
                    mapping.push({ beat: step.start_beat, x });
                }
                stepIdx++;
                continue;
            }

            cursor.next();
            pIdx++;
        }

        cursor.hide();
        cursor.reset();

        // Gate de confiabilidade: se mapeou pouco, descarta para usar próximo fallback
        const matchRatio = sortedSteps.length > 0 ? (mapping.length / sortedSteps.length) : 0;
        if (mapping.length < MIN_MATCHED_NOTES || matchRatio < MIN_MATCH_RATIO) {
            console.warn('[buildBeatToXMapping:V2ByTime] Insufficient coverage, rejecting', {
                mapped: mapping.length,
                total: sortedSteps.length,
                ratio: Number(matchRatio.toFixed(2))
            });
            return [];
        }

        return finalizeMapping(mapping);
    } catch (e) {
        console.error('[buildBeatToXMapping:V2ByTime] Error:', e);
        cursor.hide();
        cursor.reset();
        return [];
    }
}

/**
 * Scan completo do cursor OSMD - captura TODAS as posições X disponíveis
 * Tenta extrair beat do iterator, mas se falhar, interpola baseado em steps
 */
function buildFullCursorScan(
    osmdCtrl: OsmdController,
    getAbsBeat: () => number | null,
    sortedSteps?: LessonStepV2[]
): BeatToXEntry[] {
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) return [];

    const cursor = osmd.cursor;
    const iterator = (cursor as any).Iterator ?? (cursor as any).iterator;
    const mapping: BeatToXEntry[] = [];
    const LIMIT = 10000;
    let pIdx = 0;

    try {
        cursor.reset();
        cursor.show();

        while (!Boolean(iterator?.EndReached ?? iterator?.endReached) && pIdx < LIMIT) {
            const cursorBeat = getAbsBeat();
            const cursorElement = cursor.cursorElement || cursor.CursorElement;
            
            if (cursorElement && cursorBeat !== null) {
                const x = getCursorXPosition(cursorElement, osmd.container);
                mapping.push({ beat: cursorBeat, x });
            }

            cursor.next();
            pIdx++;
        }

        cursor.hide();
        cursor.reset();
        
        // Verificar se conseguimos beats variados
        const uniqueBeats = new Set(mapping.map(m => m.beat.toFixed(2))).size;
        
        if (mapping.length > 1 && uniqueBeats > 1) {
            console.log(`[buildFullCursorScan] ✅ Success: ${mapping.length} entries, ${uniqueBeats} unique beats`);
            return mapping;
        }
        
        // Se falhou em extrair beats, tentar interpolação baseada em steps
        if (sortedSteps && sortedSteps.length > 0) {
            console.log('[buildFullCursorScan] Iterator not providing beats, trying step-based interpolation');
            return buildStepBasedScan(osmdCtrl, sortedSteps);
        }
        
        return [];
    } catch (e) {
        console.error('[buildFullCursorScan] Error:', e);
        cursor.hide();
        cursor.reset();
        return [];
    }
}

/**
 * Scan que associa posições X do cursor aos beats dos steps
 * Usa diferença de X para estimar quando chegamos no próximo step
 */
function buildStepBasedScan(
    osmdCtrl: OsmdController,
    sortedSteps: LessonStepV2[]
): BeatToXEntry[] {
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) return [];

    const cursor = osmd.cursor;
    const iterator = (cursor as any).Iterator ?? (cursor as any).iterator;
    const mapping: BeatToXEntry[] = [];
    const LIMIT = 10000;
    let pIdx = 0;
    let stepIdx = 0;
    
    // Mapeia cada step para uma posição X
    const stepToX: Map<number, number> = new Map();

    try {
        cursor.reset();
        cursor.show();

        while (!Boolean(iterator?.EndReached ?? iterator?.endReached) && pIdx < LIMIT && stepIdx < sortedSteps.length) {
            const cursorElement = cursor.cursorElement || cursor.CursorElement;
            const targetStep = sortedSteps[stepIdx];
            
            if (cursorElement && targetStep) {
                const x = getCursorXPosition(cursorElement, osmd.container);
                
                // Se este é o primeiro step ou X mudou significativamente desde o último step mapeado
                const lastMappedX = stepIdx > 0 ? stepToX.get(sortedSteps[stepIdx - 1].start_beat) : null;
                const minXDelta = 20; // pixels mínimos entre steps
                
                if (lastMappedX === null || Math.abs(x - lastMappedX) > minXDelta || pIdx === 0) {
                    stepToX.set(targetStep.start_beat, x);
                    stepIdx++;
                }
            }

            cursor.next();
            pIdx++;
        }

        cursor.hide();
        cursor.reset();

        // Converter mapa para array de entries
        for (const [beat, x] of stepToX) {
            mapping.push({ beat, x });
        }
        
        mapping.sort((a, b) => a.beat - b.beat);

        console.log(`[buildStepBasedScan] Mapped ${mapping.length}/${sortedSteps.length} steps to X positions`);
        
        return mapping;
    } catch (e) {
        console.error('[buildStepBasedScan] Error:', e);
        cursor.hide();
        cursor.reset();
        return [];
    }
}

/**
 * Finalize mapping: add start/end points, ensure continuity
 */
function finalizeMapping(mapping: BeatToXEntry[]): BeatToXEntry[] {
    if (mapping.length === 0) {
        return [{ beat: 0, x: 0 }];
    }

    const result = [...mapping].sort((a, b) => a.beat - b.beat);

    const computePpbFromTail = (entries: BeatToXEntry[], sampleSize: number): number => {
        const slopes: number[] = [];
        for (let i = entries.length - 1; i > 0 && slopes.length < sampleSize; i--) {
            const prev = entries[i - 1];
            const curr = entries[i];
            const beatDiff = curr.beat - prev.beat;
            const xDiff = curr.x - prev.x;
            if (beatDiff > EPSILON && xDiff > EPSILON) {
                slopes.push(xDiff / beatDiff);
            }
        }
        if (slopes.length === 0) return DEFAULT_PPB;
        slopes.sort((a, b) => a - b);
        return slopes[Math.floor(slopes.length / 2)];
    };

    const ppb = computePpbFromTail(result, 5);

    // Add beat 0 if missing
    if (result[0].beat > 0) {
        const first = result[0];
        const x0 = first.x - (first.beat * ppb);
        result.unshift({ beat: 0, x: x0 });
    }

    // Add end point (far ahead for safe scrolling)
    const last = result[result.length - 1];
    result.push({ beat: last.beat + 100, x: last.x + (100 * ppb) });

    return result;
}

/**
 * Interpolate X position for a given beat
 */
export function interpolateBeatToX(beat: number, mapping: BeatToXEntry[]): number {
    if (!mapping || mapping.length === 0) return 0;

    if (beat <= mapping[0].beat) return mapping[0].x;
    if (beat >= mapping[mapping.length - 1].beat) return mapping[mapping.length - 1].x;

    // Binary search
    let left = 0;
    let right = mapping.length - 1;
    let idx = 0;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (mapping[mid].beat <= beat) {
            idx = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    const curr = mapping[idx];
    const next = mapping[idx + 1];

    if (!next) return curr.x;

    // Line break: next system starts to the left; avoid interpolating "backwards"
    const isLineBreak = next.x < curr.x - LINE_BREAK_THRESHOLD;
    if (isLineBreak) {
        return beat >= next.beat - EPSILON ? next.x : curr.x;
    }

    const beatDiff = next.beat - curr.beat;
    if (beatDiff < 0.0001) return curr.x;

    const t = (beat - curr.beat) / beatDiff;
    return curr.x + t * (next.x - curr.x);
}
