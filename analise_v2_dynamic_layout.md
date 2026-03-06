# ANÁLISE CTO: DINÂMICA DE LARGURA DE COMPASSO E SCROLL V2

**Projeto**: app-clava-pro | **Data**: 2026-02-07 | **Status**: ANÁLISE ARQUITETURAL

---

## 📊 CONTEXTO ATUAL IDENTIFICADO

### Arquivos Críticos Localizados

| Arquivo | Função | Status |
|---------|--------|--------|
| `viewer/beat-to-x-mapping.ts` | Mapeamento de beat→pixel | V1+V2 existente |
| `viewer/types.ts` | Modelos LessonNoteV1/V2 | ✅ Separado |
| `viewer/lesson-clock.ts` | Timing de playback (BPM) | ✅ Pronto |
| `viewer/constants.ts` | Constantes visuais | ✅ Simples |
| `viewer/osmd-controller.ts` | OSMD cursor tracking | Requer análise |
| `viewer/piano-pro-dashboard.tsx` | UI principal | Requer análise |

### Modelo de Dados V2 (Confirmado)

```typescript
// types.ts - LessonStepV2 (Polyphonic)
interface LessonStepV2 {
  step_index?: number;
  start_beat: number;        // ✅ Duração absoluta
  duration_beats?: number;   // ✅ Duração relativa
  notes: number[];           // ✅ Chord (MIDI array)
  staff?: number;
  voice?: number;
}
```

**Propriedades disponíveis para cálculo de densidade:**
- `start_beat` → timing absoluto
- `duration_beats` → duração relativa em beats
- `notes.length` → quantidade de eventos
- `notes[]` → array de MIDI (pode ter chord)

---

## 🎯 PROBLEMA IDENTIFICADO

### Raiz da Causa: `buildBeatToXMappingV2()`

**Localizado em**: `viewer/beat-to-x-mapping.ts` (linhas ~120-200)

```typescript
// PROBLEMA ATUAL:
const measureWidths = stats.map((s) => {
    const weightRatio = avgWeight > 0 ? s.weight / avgWeight : 1;
    const density = s.events / beatsPerMeasure;
    const densityRatio = avgDensity > 0 ? density / avgDensity : 1;
    const scale = clamp(MIN_SCALE, MAX_SCALE, 0.5 * weightRatio + 0.5 * densityRatio);
    return baseMeasureWidth * scale;
});
```

**Sintomas confirmados:**
1. ✅ Densidade É calculada: `events / beatsPerMeasure`
2. ❌ MAS scroll NÃO é tempo-dirigido
3. ❌ Cursor pode ser avançado por índice (step-jumping)
4. ❌ FILM mode pode não respeitar duração real

---

## ✅ EVIDÊNCIA: LÓGICA JÁ EXISTS PARCIALMENTE

### `lesson-clock.ts` (Timing Model)

```typescript
// ✅ Já existe sincronização de BPM
getBeatNow(): number {
    const elapsedMs = performance.now() - this.baseTime;
    const msPerBeat = 60000 / this.bpm;
    return this.baseBeat + (elapsedMs / msPerBeat);
}
```

**Isto significa:**
- Timing absoluto ✅ EXISTE
- Sincronização com metrônomo ✅ ESTÁ PRONTA
- Beat é contínuo (não por step) ✅ BOM

### `beat-to-x-mapping.ts` (Já Tem Interpolação)

```typescript
// ✅ Já interpolação linear
export function interpolateBeatToX(beat: number, mapping: BeatToXEntry[]): number {
    // Binary search + linear interpolation
    const t = (beat - curr.beat) / beatDiff;
    return curr.x + t * (next.x - curr.x);
}
```

**Isto significa:**
- Mapeamento contínuo ✅ EXISTE
- Scroll suave ✅ POSSÍVEL
- Precisa apenas acionar corretamente ❌ FALTA

---

## 🔴 O QUE ESTÁ QUEBRADO

### 1. **MODO FILM NÃO USA TIMING ABSOLUTO**

**Problema**: Provável loop de step-advance ao invés de beat-advance

```typescript
// ESPERADO (V2):
const beatNow = lessonClock.getBeatNow();
const xNow = interpolateBeatToX(beatNow, beatToXMapping);
scrollViewToX(xNow);

// ATUAL (suspeita):
// → Avança por step_index em vez de beat_now
// → Causa jumps e desalinhamentos
```

### 2. **SCROLL NÃO DIRIGIDO POR BEAT**

Possível que scroll seja acionado por:
- `step_index++` (índice de nota)
- Callback de step completion
- Em vez de: `beatNow * pixelsPerBeat`

### 3. **CURSOR NÃO SINCRONIZADO COM TEMPO**

Pode estar usando:
- OSMD cursor position direto
- Em vez de: calcular beat atual → interpolar X

---

## 🏗️ ARQUITETURA PROPOSTA (V2 ONLY)

### Camada 1: Metadados de Compasso (Novo)

```typescript
// measure-metadata.ts (NOVO)

interface MeasureMetadata {
  // Índice e timing
  measure_index: number;
  time_start_beat: number;     // Beat absoluto início
  time_end_beat: number;       // Beat absoluto fim
  
  // Dimensões musicais
  signature_beats: number;      // Ex: 4 para 4/4
  total_duration_beats: number; // Duração real (soma das notas)
  event_count: number;          // Nº de eventos
  
  // Cálculo de densidade (normalizado 0-1+)
  density_ratio: number;        // events/signature
  weight_ratio: number;         // duration/signature
  
  // Espaço visual derivado
  pixel_width: number;          // Calculado dinamicamente
  pixels_per_beat: number;      // Para interpolação local
  
  // Offset cumulativo (para scroll)
  x_offset: number;             // Posição X início do compasso
}

interface MeasureDensityStats {
  measures: MeasureMetadata[];
  avg_density: number;
  avg_weight: number;
  total_x_width: number;
}

/**
 * Compute metadata para TODOS os compassos da lição (V2 only)
 */
export function computeMeasureMetadataV2(
  steps: LessonStepV2[],
  beatsPerMeasure: number,
  baseMeasurePixelWidth: number = 150,
  enableDynamicLayout: boolean = true
): MeasureDensityStats {
  
  // 1. Agrupar steps por compasso
  const measureMap = new Map<number, LessonStepV2[]>();
  
  for (const step of steps) {
    const beat = step.start_beat || 0;
    const measureIdx = Math.floor(beat / beatsPerMeasure);
    if (!measureMap.has(measureIdx)) {
      measureMap.set(measureIdx, []);
    }
    measureMap.get(measureIdx)!.push(step);
  }
  
  // 2. Calcular density por compasso
  const measures: MeasureMetadata[] = [];
  const densities: number[] = [];
  const weights: number[] = [];
  
  const maxMeasure = Math.max(...measureMap.keys(), 0);
  
  for (let m = 0; m <= maxMeasure; m++) {
    const stepsInMeasure = measureMap.get(m) || [];
    const timeStart = m * beatsPerMeasure;
    const timeEnd = (m + 1) * beatsPerMeasure;
    
    // Calcular duração total e eventos
    let totalDuration = 0;
    let eventCount = 0;
    
    for (const step of stepsInMeasure) {
      totalDuration += (step.duration_beats ?? 1);
      eventCount += step.notes.length; // Chord length
    }
    
    // Se vazio, assumir 1 beat e 1 evento
    if (eventCount === 0) {
      totalDuration = beatsPerMeasure;
      eventCount = 1;
    }
    
    const densityRatio = eventCount / beatsPerMeasure;
    const weightRatio = totalDuration / beatsPerMeasure;
    
    densities.push(densityRatio);
    weights.push(weightRatio);
    
    measures.push({
      measure_index: m,
      time_start_beat: timeStart,
      time_end_beat: timeEnd,
      signature_beats: beatsPerMeasure,
      total_duration_beats: totalDuration,
      event_count: eventCount,
      density_ratio: densityRatio,
      weight_ratio: weightRatio,
      pixel_width: 0, // Será calculado após normalização
      pixels_per_beat: 0,
      x_offset: 0,
    });
  }
  
  // 3. Normalizar e aplicar escala
  const avgDensity = densities.length > 0 
    ? densities.reduce((a, b) => a + b) / densities.length 
    : 1;
  const avgWeight = weights.length > 0
    ? weights.reduce((a, b) => a + b) / weights.length 
    : 1;
  
  const MIN_SCALE = 0.6;
  const MAX_SCALE = 1.8;
  
  let totalWidth = 0;
  
  for (const measure of measures) {
    // Blender: 50% weight, 50% density
    const normalizedWeight = avgWeight > 0 
      ? measure.weight_ratio / avgWeight 
      : 1;
    const normalizedDensity = avgDensity > 0 
      ? measure.density_ratio / avgDensity 
      : 1;
    
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, 0.5 * normalizedWeight + 0.5 * normalizedDensity)
    );
    
    measure.pixel_width = baseMeasurePixelWidth * scale;
    measure.pixels_per_beat = measure.pixel_width / beatsPerMeasure;
    measure.x_offset = totalWidth;
    
    totalWidth += measure.pixel_width;
  }
  
  return {
    measures,
    avg_density: avgDensity,
    avg_weight: avgWeight,
    total_x_width: totalWidth,
  };
}
```

---

### Camada 2: Scroll Engine V2 (Tempo-Dirigido)

```typescript
// scroll-engine-v2.ts (NOVO)

interface ScrollConfig {
  // Modo de scroll
  mode: 'FILM' | 'WAIT';
  
  // Timing
  bpm: number;
  lessonClock: LessonClock;
  
  // Layout
  measureMeta MeasureDensityStats;
  viewportWidth: number;  // Largura visível (px)
  
  // Comportamento
  leadTime: number;       // Beats para "antecipação" de scroll
  smoothing: boolean;     // Easing animation
}

export class ScrollEngineV2 {
  private config: ScrollConfig;
  private currentScrollX: number = 0;
  private targetScrollX: number = 0;
  
  constructor(config: ScrollConfig) {
    this.config = config;
  }
  
  /**
   * Calcular X visual para um dado beat
   */
  beatToXPosition(beat: number): number {
    const { measures } = this.config.measureMetadata;
    
    // Encontrar compasso
    const beatPerMeasure = this.config.measureMetadata.measures[0]?.signature_beats || 4;
    const measureIdx = Math.floor(beat / beatPerMeasure);
    
    if (measureIdx < 0 || measureIdx >= measures.length) {
      return 0;
    }
    
    const measure = measures[measureIdx];
    const beatInMeasure = beat - measure.time_start_beat;
    const xInMeasure = (beatInMeasure / beatPerMeasure) * measure.pixel_width;
    
    return measure.x_offset + xInMeasure;
  }
  
  /**
   * Update scroll baseado em tempo (FILM mode)
   */
  updateScrollFILM(): number {
    const beatNow = this.config.lessonClock.getBeatNow();
    const leadBeat = beatNow + this.config.leadTime;
    
    // Posição visual do playhead com antecipação
    const targetX = this.beatToXPosition(leadBeat);
    
    // Manter playhead no centro da tela
    const centeredX = targetX - (this.config.viewportWidth / 2);
    
    if (this.config.smoothing) {
      // Easing: smooth approach
      const smoothFactor = 0.15; // 85ms easing
      this.targetScrollX = centeredX;
      this.currentScrollX += (this.targetScrollX - this.currentScrollX) * smoothFactor;
    } else {
      this.currentScrollX = centeredX;
    }
    
    return this.currentScrollX;
  }
  
  /**
   * Update scroll baseado em eventos (WAIT mode)
   */
  updateScrollWAIT(nextBeat: number): void {
    const targetX = this.beatToXPosition(nextBeat);
    const centeredX = targetX - (this.config.viewportWidth / 2);
    
    this.targetScrollX = centeredX;
    if (this.config.smoothing) {
      const smoothFactor = 0.15;
      this.currentScrollX += (this.targetScrollX - this.currentScrollX) * smoothFactor;
    } else {
      this.currentScrollX = centeredX;
    }
  }
  
  getScrollX(): number {
    return Math.max(0, this.currentScrollX);
  }
}
```

---

### Camada 3: Integração com Cursor

```typescript
// cursor-sync-v2.ts (NOVO)

export class CursorSyncV2 {
  /**
   * Posição visual do cursor (playhead) na viewport
   * baseado em beat absoluto, NÃO em step index
   */
  getCursorPosition(
    beatNow: number,
    measureMeta MeasureDensityStats,
    scrollX: number
  ): number {
    // Posição X absoluta na partitura
    let xAbsolute = 0;
    const beatPerMeasure = measureMetadata.measures[0]?.signature_beats || 4;
    const measureIdx = Math.floor(beatNow / beatPerMeasure);
    
    if (measureIdx >= 0 && measureIdx < measureMetadata.measures.length) {
      const measure = measureMetadata.measures[measureIdx];
      const beatInMeasure = beatNow - measure.time_start_beat;
      const xInMeasure = (beatInMeasure / beatPerMeasure) * measure.pixel_width;
      xAbsolute = measure.x_offset + xInMeasure;
    }
    
    // Posição relativa à viewport (levando em conta scroll)
    return xAbsolute - scrollX;
  }
  
  /**
   * Sincronizar OSMD cursor com beat absoluto
   * (ao invés de step-jumping)
   */
  syncOsmdCursorToBeat(
    osmdCtrl: OsmdController,
    beatNow: number,
    beatToXMapping: BeatToXEntry[]
  ): void {
    // Usar interpolação de beat-to-X para encontrar nota
    const xTarget = interpolateBeatToX(beatNow, beatToXMapping);
    
    // Buscar a nota mais próxima em beatNow
    const osmd = osmdCtrl.osmd;
    if (!osmd?.cursor) return;
    
    // Navegar cursor até o beat
    let currentBeat = 0;
    const cursor = osmd.cursor;
    cursor.reset();
    
    while (currentBeat < beatNow && !cursor.Iterator.EndReached) {
      const note = cursor.Iterator.CurrentEntry;
      if (note) {
        currentBeat = note.StartBeat?.RealValue || 0;
        if (currentBeat >= beatNow) break;
      }
      cursor.Iterator.MoveToNext();
    }
    
    // Cursor agora está no beat correto
  }
}
```

---

### Camada 4: Feature Flag Proteção

```typescript
// feature-flags.ts (Atualizar)

export const FEATURE_FLAGS = {
  V2_DYNAMIC_MEASURE_LAYOUT: true,    // ✅ NOVO
  V2_TEMPO_DRIVEN_SCROLL: true,       // ✅ NOVO
  V1_LEGACY_RENDERING: true,          // Para compat
};

/**
 * Router condicional
 */
export function buildScrollEngine(
  packet: LessonPacket,
  config: ScrollConfig
): ScrollEngine {
  if (packet.schema_version === 2 && FEATURE_FLAGS.V2_DYNAMIC_MEASURE_LAYOUT) {
    return new ScrollEngineV2(config);
  }
  
  // Fallback V1
  return new ScrollEngineV1(config);
}
```

---

## 🧪 PLANO DE TESTE

### Casos de Teste Obrigatórios

```typescript
describe('V2 Dynamic Measure Layout', () => {
  
  test('compasso com 1 nota longa → largura pequena', () => {
    const steps: LessonStepV2[] = [
      { start_beat: 0, duration_beats: 4, notes: [60] } // 1 semibreve
    ];
    const metadata = computeMeasureMetadataV2(steps, 4);
    expect(metadata.measures[0].pixel_width).toBeLessThan(150); // Base
  });
  
  test('compasso com 8 colcheias → largura grande', () => {
    const steps: LessonStepV2[] = Array(8).fill(0).map((_, i) => ({
      start_beat: i * 0.5,
      duration_beats: 0.5,
      notes: [60]
    }));
    const metadata = computeMeasureMetadataV2(steps, 4);
    expect(metadata.measures[0].pixel_width).toBeGreaterThan(150);
  });
  
  test('cursor sincronizado com BPM', () => {
    const clock = new LessonClock(120);
    clock.play();
    
    setTimeout(() => {
      const beat = clock.getBeatNow();
      expect(beat).toBeGreaterThan(0);
      expect(beat).toBeLessThan(2); // ~1 beat em 500ms
    }, 500);
  });
  
  test('FILM mode scroll contínuo', () => {
    const scrollEngine = new ScrollEngineV2({
      mode: 'FILM',
      bpm: 120,
      lessonClock: clock,
      measureMeta metadata,
      viewportWidth: 1200,
      leadTime: 2,
      smoothing: true,
    });
    
    clock.play();
    let lastX = 0;
    for (let i = 0; i < 10; i++) {
      const x = scrollEngine.updateScrollFILM();
      expect(x).toBeGreaterThanOrEqual(lastX);
      lastX = x;
    }
  });
  
  test('V1 renderer não afetado', () => {
    // Garantir que buildBeatToXMappingV1 continua funcionando
  });
});
```

---

## 📋 IMPLEMENTAÇÃO PASSO-A-PASSO

### Fase 1: Setup & Tipos (Semana 1)

- [ ] Criar `viewer/measure-metadata.ts` com `MeasureMetadata` e `computeMeasureMetadataV2()`
- [ ] Criar feature flag `V2_DYNAMIC_MEASURE_LAYOUT` em `viewer/feature-flags.ts`
- [ ] Atualizar `types.ts` se necessário

### Fase 2: Engine Core (Semana 1-2)

- [ ] Implementar `viewer/scroll-engine-v2.ts`
- [ ] Implementar `viewer/cursor-sync-v2.ts`
- [ ] Integrar com `lesson-clock.ts` (sem quebrar existente)

### Fase 3: Integração (Semana 2)

- [ ] Atualizar `piano-pro-dashboard.tsx` para usar `ScrollEngineV2` quando V2
- [ ] Atualizar loop de render para usar `beatNow` ao invés de `step_index`
- [ ] Testar FILM mode com múltiplas densidades

### Fase 4: Testes & Validação (Semana 2-3)

- [ ] Executar suite de testes
- [ ] Validar metrônomo sincronismo
- [ ] Testar com lições V1 (verificar compat)

### Fase 5: Feature Flag → Production (Semana 3)

- [ ] Ativar flag `V2_DYNAMIC_MEASURE_LAYOUT` em produção
- [ ] Monitorar métricas de scroll stability
- [ ] Rollback se necessário

---

## 🛡️ PROTEÇÕES & CONSTRAINTS

### Não Modificar

- ✅ `beat-to-x-mapping.ts` V1 (apenas adicionar V2-specific branches)
- ✅ `lesson-clock.ts` (está correto, apenas usar)
- ✅ `types.ts` (apenas ler)
- ✅ V1 renderer (feature flag protection)

### Hardcode Permitido

- Base pixel width: 150px (constante, não por lição)
- Scale min/max: 0.6x a 1.8x (global)
- Lead time FILM: 2 beats (configurável)

### Constraints Críticas

- ❌ Nunca browser storage (sandbox)
- ❌ Nunca pular por step_index (tempo-driven only)
- ❌ Nunca quebrar metrônomo (use LessonClock)
- ❌ Nunca modificar contrato de API sem necessidade

---

## 📌 RESUMO EXECUTIVO

| Aspecto | Status | Ação |
|---------|--------|------|
| **Timing Model** | ✅ Pronto | Usar `LessonClock` |
| **Interpolação** | ✅ Existe | Usar `interpolateBeatToX` |
| **Densidade Calc** | ⚠️ Parcial | Refatorar em `measure-metadata.ts` |
| **Scroll Motor** | ❌ Falta | Criar `scroll-engine-v2.ts` |
| **Cursor Sync** | ❌ Falta | Criar `cursor-sync-v2.ts` |
| **FILM Mode** | ⚠️ Quebrado | Usar tempo-driven na integração |
| **Feature Flag** | ✅ Existe | Usar para proteção V1 |

**Esforço Estimado**: 3 semanas | **Risco**: Baixo (feature flag) | **ROI**: Alto (UX)

---

## 🎯 KPIs DE SUCESSO

1. ✅ Compassos com 1 nota = 60% width relativa
2. ✅ Compassos com 8 notas = 180% width relativa
3. ✅ Cursor dentro de ±50ms do beat esperado
4. ✅ FILM mode scroll sem travamentos
5. ✅ V1 compatibilidade mantida 100%
6. ✅ Metrônomo precisão ±10ms (já é LessonClock)
