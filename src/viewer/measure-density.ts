/**
 * measure-density.ts
 * 
 * Cálculo de densidade rítmica e peso temporal por compasso.
 * Usado como fallback quando OSMD mapping falha.
 * 
 * ESCOPO: V2 apenas, chamado por beat-to-x-mapping.ts
 */

import { LessonStepV2 } from './types';

export interface BeatToXEntry {
  beat: number;
  x: number;
}

/** Densidade calculada por compasso */
export interface MeasureDensity {
  measure_index: number;
  start_beat: number;
  end_beat: number;
  beats_per_measure: number;
  
  // Métricas brutas
  event_count: number;          // Total de eventos (notas)
  total_duration_beats: number; // Duração total ocupada
  
  // Métricas normalizadas
  density_ratio: number;        // events / beats_per_measure
  weight_ratio: number;         // duration / beats_per_measure
  
  // Visual (calculado após normalização)
  scale: number;                // 0.6 a 1.8
  pixel_width: number;          // Largura visual em px
  x_offset: number;             // Posição X cumulativa
}

/** Configuração de escala */
const DEFAULT_MIN_SCALE = 0.6;   // Compasso muito simples
const DEFAULT_MAX_SCALE = 1.8;   // Compasso muito denso
const WEIGHT_FACTOR = 0.5;
const DENSITY_FACTOR = 0.5;
const EPSILON = 1e-4;
const DEFAULT_PPB = 90;

/**
 * Computar densidades de todos os compassos
 * 
 * @param steps Array de steps V2
 * @param beatsPerMeasure Assinatura de tempo (ex: 4 para 4/4)
 * @param baseMeasureWidth Largura base em pixels (default 150)
 * @returns Array de densidades por compasso
 */
export function computeMeasureDensities(
  steps: LessonStepV2[],
  beatsPerMeasure: number,
  baseMeasureWidth: number = 150,
  minScale: number = DEFAULT_MIN_SCALE,
  maxScale: number = DEFAULT_MAX_SCALE
): MeasureDensity[] {
  
  if (!steps || steps.length === 0) {
    console.warn('[MeasureDensity] Empty steps array');
    return [];
  }
  
  if (beatsPerMeasure <= 0) {
    console.warn('[MeasureDensity] Invalid beatsPerMeasure:', beatsPerMeasure);
    beatsPerMeasure = 4; // Fallback
  }
  
  // 1. Agrupar steps por compasso
  const measureMap = new Map<number, LessonStepV2[]>();
  let maxMeasureIdx = 0;
  
  for (const step of steps) {
    const beat = step.start_beat ?? 0;
    const measureIdx = Math.floor(beat / beatsPerMeasure);
    
    if (!measureMap.has(measureIdx)) {
      measureMap.set(measureIdx, []);
    }
    measureMap.get(measureIdx)!.push(step);
    maxMeasureIdx = Math.max(maxMeasureIdx, measureIdx);
  }
  
  // 2. Calcular métricas brutas
  const densities: MeasureDensity[] = [];
  const ratios: { density: number; weight: number }[] = [];
  
  for (let m = 0; m <= maxMeasureIdx; m++) {
    const stepsInMeasure = measureMap.get(m) || [];
    const start_beat = m * beatsPerMeasure;
    const end_beat = (m + 1) * beatsPerMeasure;
    
    let event_count = 0;
    let total_duration_beats = 0;
    
    for (const step of stepsInMeasure) {
      event_count += step.notes?.length ?? 1;
      total_duration_beats += step.duration_beats ?? 1;
    }
    
    // Compasso vazio: assumir valores mínimos
    if (event_count === 0) {
      event_count = 1;
      total_duration_beats = beatsPerMeasure;
    }
    
    const density_ratio = event_count / beatsPerMeasure;
    const weight_ratio = total_duration_beats / beatsPerMeasure;
    
    ratios.push({ density: density_ratio, weight: weight_ratio });
    
    densities.push({
      measure_index: m,
      start_beat,
      end_beat,
      beats_per_measure: beatsPerMeasure,
      event_count,
      total_duration_beats,
      density_ratio,
      weight_ratio,
      scale: 1, // Será calculado
      pixel_width: 0,
      x_offset: 0,
    });
  }
  
  // 3. Normalizar e calcular escala
  const avgDensity = ratios.length > 0
    ? ratios.reduce((sum, r) => sum + r.density, 0) / ratios.length
    : 1;
  
  const avgWeight = ratios.length > 0
    ? ratios.reduce((sum, r) => sum + r.weight, 0) / ratios.length
    : 1;
  
  let cumulativeX = 0;
  
  for (const density of densities) {
    // Normalizar
    const normDensity = avgDensity > 0 ? density.density_ratio / avgDensity : 1;
    const normWeight = avgWeight > 0 ? density.weight_ratio / avgWeight : 1;
    
    // Blend 50/50
    const rawScale = 
      WEIGHT_FACTOR * normWeight +
      DENSITY_FACTOR * normDensity;
    
    // Clamp
    density.scale = Math.max(
      minScale,
      Math.min(maxScale, rawScale)
    );
    
    // Largura visual
    density.pixel_width = baseMeasureWidth * density.scale;
    density.x_offset = cumulativeX;
    
    cumulativeX += density.pixel_width;
  }
  
  return densities;
}

export interface MeasureDensityStats {
  measures: MeasureDensity[];
  avg_density: number;
  avg_weight: number;
  total_x_width: number;
}

export function computeMeasureDensityStats(
  steps: LessonStepV2[],
  beatsPerMeasure: number,
  baseMeasureWidth: number = 150,
  minScale: number = DEFAULT_MIN_SCALE,
  maxScale: number = DEFAULT_MAX_SCALE
): MeasureDensityStats {
  const measures = computeMeasureDensities(steps, beatsPerMeasure, baseMeasureWidth, minScale, maxScale);
  if (measures.length === 0) {
    return { measures: [], avg_density: 0, avg_weight: 0, total_x_width: 0 };
  }

  const avg_density = measures.reduce((sum, m) => sum + m.density_ratio, 0) / measures.length;
  const avg_weight = measures.reduce((sum, m) => sum + m.weight_ratio, 0) / measures.length;
  const total_x_width = measures.reduce((sum, m) => sum + m.pixel_width, 0);

  return { measures, avg_density, avg_weight, total_x_width };
}

/**
 * Encontrar densidade para um beat específico
 * 
 * @param beat Beat absoluto
 * @param densities Array de densidades
 * @returns Densidade ou undefined
 */
export function findDensityForBeat(
  beat: number,
  densities: MeasureDensity[]
): MeasureDensity | undefined {
  return densities.find(
    d => d.start_beat <= beat && beat < d.end_beat
  );
}

/**
 * Converter beat para posição X usando densidades
 * 
 * @param beat Beat absoluto
 * @param densities Array de densidades
 * @returns Posição X em pixels
 */
export function beatToPixelX(
  beat: number,
  densities: MeasureDensity[]
): number {
  const density = findDensityForBeat(beat, densities);
  
  if (!density) {
    // Beat fora do range: extrapolar usando último compasso
    const last = densities[densities.length - 1];
    if (last) {
      const pixelsPerBeat = last.pixel_width / last.beats_per_measure;
      const beatsAfterLast = beat - last.end_beat;
      return last.x_offset + last.pixel_width + (beatsAfterLast * pixelsPerBeat);
    }
    return 0;
  }
  
  // Interpolar dentro do compasso
  const beatInMeasure = beat - density.start_beat;
  const pixelsPerBeat = density.pixel_width / density.beats_per_measure;
  
  return density.x_offset + (beatInMeasure * pixelsPerBeat);
}

/**
 * Validar densidades calculadas
 * 
 * @param densities Array de densidades
 * @returns true se válido
 */
export function validateDensities(densities: MeasureDensity[]): boolean {
  if (densities.length === 0) {
    console.warn('[MeasureDensity] Empty densities');
    return false;
  }
  
  // Verificar continuidade de offsets
  let expectedX = 0;
  for (const d of densities) {
    if (Math.abs(d.x_offset - expectedX) > 0.01) {
      console.warn(
        `[MeasureDensity] Gap at measure ${d.measure_index}:`,
        { expected: expectedX, actual: d.x_offset }
      );
      return false;
    }
    expectedX += d.pixel_width;
  }
  
  return true;
}

/**
 * Diagnóstico: estatísticas de densidades
 */
export function getDensityStats(densities: MeasureDensity[]) {
  if (densities.length === 0) {
    return { count: 0, totalWidth: 0, avgDensity: 0, avgWeight: 0 };
  }
  
  const totalWidth = densities.reduce((sum, d) => sum + d.pixel_width, 0);
  const avgDensity = densities.reduce((sum, d) => sum + d.density_ratio, 0) / densities.length;
  const avgWeight = densities.reduce((sum, d) => sum + d.weight_ratio, 0) / densities.length;
  
  return {
    count: densities.length,
    totalWidth,
    avgDensity,
    avgWeight,
    minWidth: Math.min(...densities.map(d => d.pixel_width)),
    maxWidth: Math.max(...densities.map(d => d.pixel_width)),
  };
}

export function buildDynamicBeatToXMapping(
  steps: LessonStepV2[],
  beatsPerMeasure: number,
  basePxPerBeat: number = DEFAULT_PPB,
  minScale: number = DEFAULT_MIN_SCALE,
  maxScale: number = DEFAULT_MAX_SCALE
): BeatToXEntry[] {
  if (!steps || steps.length === 0) {
    return [{ beat: 0, x: 0 }];
  }

  const baseMeasureWidth = basePxPerBeat * beatsPerMeasure;
  const densities = computeMeasureDensities(steps, beatsPerMeasure, baseMeasureWidth, minScale, maxScale);
  if (densities.length === 0) {
    return [{ beat: 0, x: 0 }];
  }

  const entries: BeatToXEntry[] = [];
  for (const density of densities) {
    entries.push({ beat: density.start_beat, x: density.x_offset });
  }
  for (const step of steps) {
    const beat = Number(step.start_beat) || 0;
    entries.push({ beat, x: beatToPixelX(beat, densities) });
  }

  return finalizeMapping(entries, basePxPerBeat);
}

function finalizeMapping(mapping: BeatToXEntry[], basePxPerBeat: number): BeatToXEntry[] {
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
    if (slopes.length === 0) return basePxPerBeat || DEFAULT_PPB;
    slopes.sort((a, b) => a - b);
    return slopes[Math.floor(slopes.length / 2)];
  };

  const ppb = computePpbFromTail(result, 5);

  if (result[0].beat > 0) {
    const first = result[0];
    const x0 = first.x - (first.beat * ppb);
    result.unshift({ beat: 0, x: x0 });
  }

  const last = result[result.length - 1];
  result.push({ beat: last.beat + 100, x: last.x + (100 * ppb) });

  return result;
}
