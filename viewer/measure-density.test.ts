/**
 * measure-density.test.ts
 * 
 * Testes unitários para cálculo de densidade
 */

import { describe, test, expect } from 'vitest';
import {
  computeMeasureDensities,
  computeMeasureDensityStats,
  findDensityForBeat,
  beatToPixelX,
  validateDensities,
  getDensityStats,
  buildDynamicBeatToXMapping,
  type MeasureDensity,
} from './measure-density';
import { LessonStepV2 } from './types';

describe('measure-density', () => {
  
  describe('computeMeasureDensities', () => {
    
    test('compasso com 1 nota longa → métricas corretas', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] }
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      expect(densities).toHaveLength(1);
      expect(densities[0].event_count).toBe(1);
      expect(densities[0].density_ratio).toBe(0.25); // 1/4
      expect(densities[0].weight_ratio).toBe(1.0);   // 4/4
      expect(densities[0].scale).toBeCloseTo(1.0, 5);
      expect(densities[0].pixel_width).toBeCloseTo(150, 5);
    });
    
    test('compasso com 8 colcheias → métricas corretas', () => {
      const steps: LessonStepV2[] = Array(8).fill(0).map((_, i) => ({
        start_beat: i * 0.5,
        duration_beats: 0.5,
        notes: [60 + i],
      }));
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      expect(densities).toHaveLength(1);
      expect(densities[0].event_count).toBe(8);
      expect(densities[0].density_ratio).toBe(2.0);  // 8/4
      expect(densities[0].weight_ratio).toBe(1.0);   // 4/4
      expect(densities[0].scale).toBeCloseTo(1.0, 5);
      expect(densities[0].pixel_width).toBeCloseTo(150, 5);
    });
    
    test('compasso polifônico (acordes) → métricas corretas', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 1, notes: [60, 64, 67] }, // Acorde C
        { start_beat: 1, duration_beats: 1, notes: [62, 65, 69] }, // Acorde D
        { start_beat: 2, duration_beats: 1, notes: [64, 67, 71] }, // Acorde E
        { start_beat: 3, duration_beats: 1, notes: [65, 69, 72] }, // Acorde F
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      expect(densities[0].event_count).toBe(12); // 4 acordes * 3 notas
      expect(densities[0].density_ratio).toBe(3.0); // 12/4
      expect(densities[0].scale).toBeCloseTo(1.0, 5);
    });
    
    test('múltiplos compassos com densidades diferentes', () => {
      const steps: LessonStepV2[] = [
        // Compasso 0: 1 nota longa
        { start_beat: 0, duration_beats: 4, notes: [60] },
        // Compasso 1: 4 notas
        { start_beat: 4, duration_beats: 1, notes: [60] },
        { start_beat: 5, duration_beats: 1, notes: [62] },
        { start_beat: 6, duration_beats: 1, notes: [64] },
        { start_beat: 7, duration_beats: 1, notes: [65] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      expect(densities).toHaveLength(2);
      
      // Compasso 0 < Compasso 1
      expect(densities[0].pixel_width).toBeLessThan(densities[1].pixel_width);
      
      // Offsets cumulativos
      expect(densities[0].x_offset).toBe(0);
      expect(densities[1].x_offset).toBe(densities[0].pixel_width);
    });
    
    test('compasso vazio → valores default', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 1, notes: [60] },
        // Compasso 1 vazio (nenhuma nota em beats 4-8)
        { start_beat: 8, duration_beats: 1, notes: [62] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      expect(densities).toHaveLength(3); // 0, 1 (vazio), 2
      
      const emptyMeasure = densities[1];
      expect(emptyMeasure.event_count).toBe(1);  // Fallback
      expect(emptyMeasure.total_duration_beats).toBe(4); // Fallback
    });
    
    test('edge case: steps vazios', () => {
      const densities = computeMeasureDensities([], 4, 150);
      expect(densities).toHaveLength(0);
    });
    
    test('edge case: beatsPerMeasure inválido → fallback para 4', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 1, notes: [60] }
      ];
      
      const densities = computeMeasureDensities(steps, 0, 150);
      
      // Deve usar fallback 4
      expect(densities[0].beats_per_measure).toBe(4);
    });
    
  });

  describe('computeMeasureDensityStats', () => {

    test('retorna médias e largura total', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] }
      ];

      const stats = computeMeasureDensityStats(steps, 4, 150);

      expect(stats.measures).toHaveLength(1);
      expect(stats.avg_density).toBeCloseTo(stats.measures[0].density_ratio, 5);
      expect(stats.avg_weight).toBeCloseTo(stats.measures[0].weight_ratio, 5);
      expect(stats.total_x_width).toBeCloseTo(stats.measures[0].pixel_width, 5);
    });

  });
  
  describe('findDensityForBeat', () => {
    
    test('encontrar densidade para beat no meio do compasso', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
        { start_beat: 4, duration_beats: 4, notes: [62] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      const density = findDensityForBeat(2, densities);
      expect(density?.measure_index).toBe(0);
      
      const density2 = findDensityForBeat(6, densities);
      expect(density2?.measure_index).toBe(1);
    });
    
    test('beat no limite do compasso', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      const density = findDensityForBeat(4, densities);
      expect(density).toBeUndefined(); // 4 está fora [0, 4)
    });
    
    test('beat fora do range', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      const density = findDensityForBeat(100, densities);
      expect(density).toBeUndefined();
    });
    
  });
  
  describe('beatToPixelX', () => {
    
    test('interpolação linear dentro do compasso', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      // Beat 0 → x_offset
      const x0 = beatToPixelX(0, densities);
      expect(x0).toBeCloseTo(0, 1);
      
      // Beat 2 (meio) → meio da largura
      const x2 = beatToPixelX(2, densities);
      expect(x2).toBeCloseTo(densities[0].pixel_width / 2, 1);
      
      // Beat 4 (fim) → fim da largura
      const x4 = beatToPixelX(4, densities);
      expect(x4).toBeCloseTo(densities[0].pixel_width, 1);
    });
    
    test('múltiplos compassos', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
        { start_beat: 4, duration_beats: 4, notes: [62] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      // Beat 0 → início compasso 0
      expect(beatToPixelX(0, densities)).toBeCloseTo(0, 1);
      
      // Beat 4 → início compasso 1
      const x4 = beatToPixelX(4, densities);
      expect(x4).toBeCloseTo(densities[0].pixel_width, 1);
      
      // Beat 6 → meio compasso 1
      const x6 = beatToPixelX(6, densities);
      const expectedX6 = densities[0].pixel_width + (densities[1].pixel_width / 2);
      expect(x6).toBeCloseTo(expectedX6, 1);
    });
    
    test('beat além do último compasso → extrapolação', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      
      const x10 = beatToPixelX(10, densities);
      
      // Deve extrapolar usando pixels_per_beat do último compasso
      const lastDensity = densities[0];
      const pixelsPerBeat = lastDensity.pixel_width / lastDensity.beats_per_measure;
      const beatsAfter = 10 - lastDensity.end_beat;
      const expected = lastDensity.x_offset + lastDensity.pixel_width + (beatsAfter * pixelsPerBeat);
      
      expect(x10).toBeCloseTo(expected, 1);
    });
    
  });
  
  describe('validateDensities', () => {
    
    test('densidades válidas', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
        { start_beat: 4, duration_beats: 4, notes: [62] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      expect(validateDensities(densities)).toBe(true);
    });
    
    test('densities vazias', () => {
      expect(validateDensities([])).toBe(false);
    });
    
  });
  
  describe('getDensityStats', () => {
    
    test('estatísticas corretas', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 4, notes: [60] },
        { start_beat: 4, duration_beats: 1, notes: [62] },
        { start_beat: 5, duration_beats: 1, notes: [64] },
        { start_beat: 6, duration_beats: 1, notes: [65] },
        { start_beat: 7, duration_beats: 1, notes: [67] },
      ];
      
      const densities = computeMeasureDensities(steps, 4, 150);
      const stats = getDensityStats(densities);
      
      expect(stats.count).toBe(2);
      expect(stats.totalWidth).toBeGreaterThan(0);
      expect(stats.avgDensity).toBeGreaterThan(0);
      expect(stats.minWidth).toBeLessThan(stats.maxWidth);
    });
    
    test('stats vazias', () => {
      const stats = getDensityStats([]);
      expect(stats.count).toBe(0);
      expect(stats.totalWidth).toBe(0);
    });
    
  });

  describe('buildDynamicBeatToXMapping', () => {

    test('inclui beats de compassos e steps', () => {
      const steps: LessonStepV2[] = [
        { start_beat: 0, duration_beats: 1, notes: [60] },
        { start_beat: 4, duration_beats: 1, notes: [62] },
      ];

      const mapping = buildDynamicBeatToXMapping(steps, 4, 90);
      const beats = mapping.map((m) => Math.round(m.beat));

      expect(beats).toContain(0); // início do compasso 0
      expect(beats).toContain(4); // início do compasso 1
      expect(beats).toContain(0); // step 0
      expect(beats).toContain(4); // step 1
      expect(mapping.length).toBeGreaterThanOrEqual(2);
    });

  });
  
});
