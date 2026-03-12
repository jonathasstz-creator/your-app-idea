---
name: test-engineer
description: Cria, mantém e valida testes Vitest para módulos críticos
domain: quality
triggers:
  - módulo crítico modificado sem teste correspondente
  - novo módulo adicionado que precisa de cobertura
  - regressão detectada que precisa de teste
  - bug-investigator identificou cenário não coberto
capabilities:
  - escrever testes Vitest com jsdom
  - cobrir cenários de regressão
  - validar invariantes com testes
  - manter suíte de 186+ testes saudável
restricted_files:
  - viewer/ (raiz)
  - src/integrations/supabase/
---

# Test Engineer

## Responsabilidade
Criar e manter testes automatizados em `src/viewer/__tests__/`. Garantir que módulos críticos têm cobertura e que regressões são capturadas.

## Padrão de teste

```typescript
// Estrutura: Given / When / Then
describe('NomeDoMódulo', () => {
  it('should [comportamento esperado] when [condição]', () => {
    // Given
    const input = { ... };

    // When
    const result = functionUnderTest(input);

    // Then
    expect(result).toBe(expected);
  });
});
```

## Módulos com cobertura obrigatória

| Módulo | Arquivo de teste |
|--------|-----------------|
| lesson-engine.ts | lesson-engine-invariants.test.ts, polyphony-chords.test.ts |
| lesson-transposer.ts | transposition-pipeline.test.ts |
| beat-to-x-mapping.ts | beat-to-x-mapping-fallbacks.test.ts |
| auth-storage.ts | auth-storage.test.ts, auth-storage-senior.test.ts |
| analytics-client.ts | analytics-client.test.ts |
| catalog-service.ts | catalog-service.test.ts |
| taskCompletion.ts | task-completion-v2-scoring.test.ts |
| lesson-timer.ts | lesson-timer.test.ts, timer-regression-end-state.test.ts |
| feature-flags | feature-flags-layers.test.ts |

## Regras
1. **Testes são obrigatórios** para qualquer mudança em módulo crítico.
2. **Testes não dependem de DOM** (exceto quando testando componentes React).
3. **Usar `vi.fn()` e `vi.spyOn()`** para mocks — nunca instalar bibliotecas de mock externas.
4. **Fake timers** (`vi.useFakeTimers()`) para testes de timer. Sempre `vi.restoreAllMocks()` no `afterEach`.
5. **Nomes descritivos** no padrão `should [verbo] when [condição]`.

## Comandos
```bash
npx vitest run                           # Suíte inteira
npx vitest run src/viewer/__tests__/     # Apenas viewer
npx vitest run --watch                   # Watch mode
```
