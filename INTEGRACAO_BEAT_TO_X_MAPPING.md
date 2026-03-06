# 🔧 INTEGRAÇÃO: measure-density.ts → beat-to-x-mapping.ts

**Data**: 2026-02-07 | **Escopo**: V2 apenas | **Abordagem**: Fallback em cascata

---

## 🎯 OBJETIVO

Adicionar **Fallback C (densidade dinâmica)** ao `buildBeatToXMappingV2()` usando o módulo `measure-density.ts`.

---

## 📝 LOCALIZAÇÃO DO CÓDIGO

**Arquivo**: `viewer/beat-to-x-mapping.ts`

**Função**: `buildBeatToXMappingV2()`

**Linha aproximada**: ~120-200

---

## 🛡️ ESTRATÉGIA DE FALLBACK (CASCATA)

```
┌─────────────────────────────────────────────────┐
│ PASSO A: Match por MIDI (ATUAL)                        │
│ - Tentar casar step.notes com OSMD visual notes       │
│ - Calcular matchRatio = matched / totalSteps          │
│ - Se matchRatio >= 0.8 E matchedCount >= 3 → SUCESSO  │
└─────────────────────────────────────────────────┘
        │ FALHA
        ↓
┌─────────────────────────────────────────────────┐
│ PASSO B: Timestamp OSMD (NOVO - OPCIONAL)              │
│ - Usar cursor.Iterator.currentTimeStamp.RealValue     │
│ - Avançar cursor até cursorBeat >= step.start_beat     │
│ - Se mapping.length >= 2 → SUCESSO                     │
└─────────────────────────────────────────────────┘
        │ FALHA
        ↓
┌─────────────────────────────────────────────────┐
│ PASSO C: Densidade Dinâmica (NOVO - SEMPRE FUNCIONA)  │
│ - Usar measure-density.ts                             │
│ - Computar densidades por compasso                    │
│ - Gerar mapping baseado em densidade                  │
│ - SEMPRE retorna mapping válido                        │
└─────────────────────────────────────────────────┘
```

---

## 💻 CÓDIGO: PATCH PARA beat-to-x-mapping.ts

### 1. Import no topo do arquivo

```typescript
// beat-to-x-mapping.ts (ADICIONAR)

import { 
  computeMeasureDensities, 
  beatToPixelX as densityBeatToPixelX,
  validateDensities,
  type MeasureDensity 
} from './measure-density';
```

---

### 2. Atualizar interface V2MappingOptions

```typescript
// beat-to-x-mapping.ts (ATUALIZAR)

interface V2MappingOptions {
  beatsPerMeasure?: number;
  basePxPerBeat?: number;
  enableDynamic?: boolean;  // ← JÁ EXISTE (provavelmente)
}
```

---

### 3. Adicionar constantes de threshold

```typescript
// beat-to-x-mapping.ts (ADICIONAR após constantes existentes)

/** Threshold para considerar match confiável */
const MIN_MATCH_RATIO = 0.8;        // 80% de precisão
const MIN_MATCHED_NOTES = 3;        // Pelo menos 3 notas corretas

/** Fallback B: verificar se OSMD timestamp disponível */
const ENABLE_TIMESTAMP_FALLBACK = false; // ← Deixar OFF por enquanto
```

---

### 4. Modificar buildBeatToXMappingV2() - Final da função

**Localização**: Dentro de `buildBeatToXMappingV2()`, depois do loop principal

```typescript
// beat-to-x-mapping.ts (MODIFICAR - após o loop de matching)

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
    
    const sortedSteps = [...lessonSteps].sort((a, b) => 
      (a.start_beat ?? 0) - (b.start_beat ?? 0)
    );
    
    console.log('[buildBeatToXMapping:V2] Starting V2 mapping for', sortedSteps.length, 'steps');
    
    let matchedCount = 0;
    
    // ============================================================
    // PASSO A: Match por MIDI (ATUAL - MANTER COMO ESTÁ)
    // ============================================================
    
    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      
      // [Código existente de matching por MIDI aqui]
      // ...
      // Se houver match:
      //   matchedCount++;
      //   mapping.push({ beat: step.start_beat, x: cursorX });
      
    }
    
    // ============================================================
    // VERIFICAÇÃO: Match foi confiável?
    // ============================================================
    
    const matchRatio = sortedSteps.length > 0 
      ? matchedCount / sortedSteps.length 
      : 0;
    
    const isMatchReliable = (
      matchRatio >= MIN_MATCH_RATIO && 
      matchedCount >= MIN_MATCHED_NOTES &&
      mapping.length >= 2
    );
    
    if (isMatchReliable) {
      console.log(
        `[buildBeatToXMapping:V2] Match CONFIÁVEL:`, 
        { matchRatio, matchedCount, mappingLen: mapping.length }
      );
      return finalizeMapping(mapping);
    }
    
    console.warn(
      `[buildBeatToXMapping:V2] Match FRACO, usando fallback:`,
      { matchRatio, matchedCount, mappingLen: mapping.length }
    );
    
    // ============================================================
    // PASSO B: Timestamp OSMD (OPCIONAL - EXPERIMENTAL)
    // ============================================================
    
    if (ENABLE_TIMESTAMP_FALLBACK) {
      console.log('[buildBeatToXMapping:V2] Tentando Fallback B (timestamp)');
      
      // Reset cursor
      cursor.reset();
      const timestampMapping: BeatToXEntry[] = [];
      
      for (const step of sortedSteps) {
        const stepBeat = step.start_beat ?? 0;
        
        // Avançar cursor até beat desejado
        while (!cursor.Iterator.EndReached) {
          const timestamp = cursor.Iterator.currentTimeStamp?.RealValue;
          
          if (timestamp !== undefined && timestamp >= stepBeat) {
            const cursorElement = cursor.cursorElement || cursor.CursorElement;
            if (cursorElement) {
              const x = getCursorXPosition(cursorElement, osmd.container);
              timestampMapping.push({ beat: stepBeat, x });
            }
            break;
          }
          
          cursor.Iterator.MoveToNext();
        }
      }
      
      if (timestampMapping.length >= 2) {
        console.log(
          '[buildBeatToXMapping:V2] Fallback B SUCESSO:',
          timestampMapping.length
        );
        return finalizeMapping(timestampMapping);
      }
      
      console.warn(
        '[buildBeatToXMapping:V2] Fallback B FALHOU:',
        timestampMapping.length
      );
    }
    
    // ============================================================
    // PASSO C: Densidade Dinâmica (SEMPRE FUNCIONA)
    // ============================================================
    
    if (!enableDynamic) {
      console.warn('[buildBeatToXMapping:V2] Dynamic disabled, retornando mapping vazio');
      return finalizeMapping(mapping); // Pode ser vazio
    }
    
    console.log('[buildBeatToXMapping:V2] Usando Fallback C (densidade dinâmica)');
    
    // Computar densidades
    const baseMeasureWidth = basePxPerBeat * beatsPerMeasure;
    const densities = computeMeasureDensities(
      sortedSteps,
      beatsPerMeasure,
      baseMeasureWidth
    );
    
    if (densities.length === 0) {
      console.error('[buildBeatToXMapping:V2] Fallback C falhou: nenhuma densidade');
      return [{ beat: 0, x: 0 }];
    }
    
    // Validar
    if (!validateDensities(densities)) {
      console.warn('[buildBeatToXMapping:V2] Densidades inválidas, mas continuando');
    }
    
    // Gerar mapping a partir de densidades
    const densityMapping: BeatToXEntry[] = [];
    
    // Adicionar início de cada compasso
    for (const d of densities) {
      densityMapping.push({ 
        beat: d.start_beat, 
        x: d.x_offset 
      });
    }
    
    // Adicionar cada step
    for (const step of sortedSteps) {
      const beat = step.start_beat ?? 0;
      const x = densityBeatToPixelX(beat, densities);
      densityMapping.push({ beat, x });
    }
    
    console.log(
      `[buildBeatToXMapping:V2] Fallback C SUCESSO:`,
      { 
        densities: densities.length, 
        mappingLen: densityMapping.length,
        totalWidth: densities[densities.length - 1].x_offset + 
                    densities[densities.length - 1].pixel_width
      }
    );
    
    return finalizeMapping(densityMapping);
    
  } catch (err) {
    console.error('[buildBeatToXMapping:V2] Error:', err);
    return [{ beat: 0, x: 0 }];
  }
}
```

---

## ✅ CHECKLIST DE INTEGRAÇÃO

- [ ] Importar `measure-density.ts` no topo
- [ ] Adicionar constantes `MIN_MATCH_RATIO`, `MIN_MATCHED_NOTES`
- [ ] Adicionar variável `matchedCount` no loop de matching
- [ ] Adicionar verificação `isMatchReliable`
- [ ] Implementar Fallback B (opcional, pode deixar OFF)
- [ ] Implementar Fallback C com `computeMeasureDensities()`
- [ ] Testar com lição curta V2
- [ ] Testar com lição longa/densa V2
- [ ] Validar logs no console
- [ ] Confirmar V1 não afetado

---

## 🧪 TESTES SUGERIDOS

### 1. Teste Unitário (adicionar em beat-to-x-mapping.test.ts)

```typescript
describe('buildBeatToXMappingV2 com fallback densidade', () => {
  
  test('fallback C ativa quando match ratio baixo', () => {
    // Mock OSMD com matching ruim
    const mockOsmd = createMockOsmdWithBadMatching();
    
    const steps: LessonStepV2[] = [
      { start_beat: 0, duration_beats: 4, notes: [60] },
      { start_beat: 4, duration_beats: 1, notes: [62] },
      { start_beat: 5, duration_beats: 1, notes: [64] },
    ];
    
    const mapping = buildBeatToXMappingV2(mockOsmd, steps, {
      beatsPerMeasure: 4,
      enableDynamic: true,
    });
    
    expect(mapping.length).toBeGreaterThan(0);
    expect(mapping[0].beat).toBe(0);
  });
  
});
```

### 2. Teste Manual

1. Abrir lição V2 curta (ex: 10 notas)
2. Verificar console:
   ```
   [buildBeatToXMapping:V2] Match CONFIÁVEL: {matchRatio: 0.9, ...}
   ```
   OU
   ```
   [buildBeatToXMapping:V2] Match FRACO, usando fallback: ...
   [buildBeatToXMapping:V2] Usando Fallback C (densidade dinâmica)
   [buildBeatToXMapping:V2] Fallback C SUCESSO: {densities: 2, ...}
   ```

3. Scroll deve funcionar suavemente
4. Compassos densos devem ocupar mais espaço visual

---

## 🚨 AVISOS IMPORTANTES

### 1. NÃO quebrar V1

Verificar que `buildBeatToXMappingV1()` **não é modificado**.

### 2. Fallback B (Timestamp) é EXPERIMENTAL

```typescript
const ENABLE_TIMESTAMP_FALLBACK = false; // ← Deixar OFF por enquanto
```

Motivo:
- `currentTimeStamp` pode não existir em todas as versões OSMD
- Precisa testes mais robustos
- Fallback C já resolve o problema

### 3. Logs são importantes

Manter todos os `console.log/warn` para diagnóstico.

Em produção, pode adicionar condicional:
```typescript
const DEBUG_MAPPING = import.meta.env.DEV;

if (DEBUG_MAPPING) {
  console.log('[buildBeatToXMapping:V2] ...');
}
```

---

## 📊 IMPACT ASSESSMENT

| Aspecto | Impacto |
|---------|--------|
| **V1** | ✅ Nenhum (isolado) |
| **V2 WAIT** | ✅ Nenhum (não usa mapping) |
| **V2 FILM** | ✅ Melhora (scroll correto) |
| **Tamanho arquivo** | +~100 linhas (beat-to-x-mapping.ts) |
| **Performance** | Neut neutro (cálculo 1x ao carregar) |
| **Testabilidade** | ✅ Muito melhor (módulo separado) |

---

## 🎯 KPIs DE SUCESSO

1. ✅ `matchRatio >= 0.8` → Passo A funciona
2. ✅ `matchRatio < 0.8` → Fallback C ativa
3. ✅ `mapping.length > 0` sempre
4. ✅ Compassos densos > largura que simples
5. ✅ Scroll suave (sem jumps)
6. ✅ V1 não afetado

---

**Status**: ✅ PRONTO PARA IMPLEMENTAR

**Próximo passo**: Aplicar patch em `beat-to-x-mapping.ts` e testar.
