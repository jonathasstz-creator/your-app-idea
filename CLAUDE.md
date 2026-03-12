# CLAUDE.md

Contexto operacional para agentes de IA. Fonte de verdade para fluxo real, paths canônicos e comportamento atual.

> **Última atualização:** 2026-03-12

---

## Build Path Canônico

| Item | Path |
|------|------|
| Entrypoint HTML | `index.html` |
| Entrypoint JS | `src/main.tsx` → `src/viewer/index.tsx` |
| Pasta canônica | `src/viewer/` |
| Pasta legado (NÃO editar) | `viewer/` (raiz) |
| Config runtime | `src/config/app-config.ts` |
| Feature flags types | `src/viewer/feature-flags/types.ts` |
| Feature flags store | `src/viewer/feature-flags/store.ts` |
| Feature flags providers | `src/viewer/feature-flags/providers/local.ts`, `remote.ts` |
| Feature flags React | `src/viewer/feature-flags/react.tsx` |

**Regra absoluta:** toda edição de viewer vai em `src/viewer/`. A pasta `viewer/` na raiz é legado e candidata a remoção.

---

## Feature Flags — Resolução Real

```
1. DEFAULT_FLAGS (src/viewer/feature-flags/types.ts)
2. localStorage key: "viewer:featureFlags:v1"
3. Remote provider (se configurado)
4. Runtime: window.__flags.set('flagName', true, 'runtime')
```

Flags atuais e defaults:

| Flag | Default | Propósito |
|------|---------|-----------|
| `showSheetMusic` | `true` | Exibe partitura OSMD |
| `showFallingNotes` | `true` | Exibe piano roll |
| `showNewCurriculum` | `true` | Currículo novo |
| `showIntermediateCurriculum` | `true` | Currículo intermediário |
| `useWebSocket` | `false` | Transport WebSocket |
| `useStepQualityStreak` | `false` | Scoring por qualidade de step (engine V2) |
| `showStepQualityFeedback` | `false` | Feedback visual no HUD |

### featureFlagSnapshot em index.tsx

`featureFlagSnapshot` é a variável que o handler MIDI consulta para decidir branches de execução. Ela é atualizada via `featureFlags.subscribe()` e reflete mudanças em tempo real (inclusive via `window.__flags.set()`).

---

## Step Quality UX/HUD — Comportamento Real

### Pré-condições para o feedback visual aparecer

1. **Flag `showStepQualityFeedback` = true** (via localStorage, remote ou runtime)
2. **Flag `useStepQualityStreak` = true** (ativa o scoring no engine)
3. **Lição V2** (`currentSchemaVersion === 2`)
4. **Modo WAIT** (FILM usa streak legado, não step quality)

Se qualquer condição acima for falsa, o bloco de feedback é silenciosamente ignorado.

### Arquivos do Step Quality

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/viewer/types/step-quality.ts` | Enum `StepQuality`, tipos |
| `src/viewer/step-quality-ui.ts` | Controllers: `StepQualityBadgeController`, `NoteFeedbackController`, `ChordClosureEffect` |
| `src/viewer/lesson-engine.ts` | Lógica de classificação (PERFECT/GREAT/GOOD/RECOVERED), tracking de soft/hard errors |
| `src/viewer/index.tsx` | Wiring: instanciação dos controllers, leitura de flags, chamadas no handler MIDI |

### DOM Elements

| ID | Controller | Propósito |
|----|-----------|-----------|
| `#hud-quality-badge` | `StepQualityBadgeController` | Badge animado (Perfeito/Ótimo/Boa/Recuperou) |
| `#judge-feedback` | `NoteFeedbackController` | Feedback por nota (✓, ✗, ♪ x/y) |
| `#hud-step` | `ChordClosureEffect` | Pulse ao fechar acorde |

### Wiring em index.tsx

- Controllers são instanciados **sempre** no boot (não dependem de flag para existir).
- Tolerantes a elemento DOM ausente (checam `if (!this.el) return`).
- O handler MIDI verifica `featureFlagSnapshot.showStepQualityFeedback` antes de chamar qualquer controller.
- `engine.setUseStepQuality(true)` é chamado quando `useStepQualityStreak` está ativa.

### Armadilha histórica (corrigida 2026-03-12)

**Bug:** controllers eram criados condicionalmente (`if (flag) { new Controller() }`). Se a flag estava `false` no boot, controllers ficavam `null` para sempre. Adicionalmente, `featureFlagSnapshot` era capturado uma vez no init e nunca atualizado — `window.__flags.set()` não tinha efeito.

**Fix:** criação incondicional dos controllers + `featureFlags.subscribe(next => { featureFlagSnapshot = next })`.

---

## Guards que bloqueiam execução em index.tsx

O handler MIDI em `index.tsx` tem múltiplos guards. Para debugging, verificar:

1. `currentSchemaVersion === 2` — bloqueia V1
2. `currentMode === 'WAIT'` — bloqueia FILM
3. `featureFlagSnapshot.showStepQualityFeedback` — bloqueia se flag off
4. `featureFlagSnapshot.useStepQualityStreak` — bloqueia scoring
5. `engine !== null` — bloqueia se engine não inicializado
6. `engine.isEnded()` — bloqueia após fim da lição

---

## Testes

```bash
npx vitest run                           # Suíte completa (186+ testes)
npx vitest run src/viewer/__tests__/     # Apenas viewer
```

**Cobertura importante ausente:** `index.tsx` não tem testes diretos. Bugs de wiring (controllers, snapshots, guards) só são detectáveis por inspeção manual ou testes de integração.
