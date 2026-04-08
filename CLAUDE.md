# CLAUDE.md

Contexto operacional para agentes de IA. Fonte de verdade para fluxo real, paths canônicos e comportamento atual.

> **Última atualização:** 2026-04-08 — Step Quality V1 feedback, flag toggle anti-flicker, audio pipeline unificado.

---

## Build Path Canônico

| Item | Path |
|------|------|
| Entrypoint HTML | `index.html` |
| Entrypoint JS | `src/main.tsx` → `src/viewer/index.tsx` |
| Pasta canônica | `src/viewer/` |
| Pasta legado (NÃO editar) | `viewer/` (raiz) |
| Config runtime | `src/config/app-config.ts` |
| Audio service | `src/viewer/audio-service.ts` |
| Proxy fetch centralizado | `src/viewer/proxy-fetch.ts` |
| Edge Function proxy | `supabase/functions/api-proxy/index.ts` |
| Feature flags types | `src/viewer/feature-flags/types.ts` |
| Feature flags store | `src/viewer/feature-flags/store.ts` |
| Feature flags providers | `src/viewer/feature-flags/providers/local.ts`, `remote.ts` |
| Feature flags React | `src/viewer/feature-flags/react.tsx` |

**Regra absoluta:** toda edição de viewer vai em `src/viewer/`. A pasta `viewer/` na raiz é legado e candidata a remoção.

---

## Arquitetura de Rede (API Proxy)

Todas as chamadas REST para o backend passam por:
```
Frontend → proxyFetch(path) → Edge Function api-proxy → api.devoltecomele.com
```

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `proxyFetch` | `src/viewer/proxy-fetch.ts` | Centraliza chamadas, injeta `x-external-auth` + `apikey` |
| `api-proxy` | `supabase/functions/api-proxy/index.ts` | Encaminha para backend com CORS `*` |
| Backend | `api.devoltecomele.com` | FastAPI, prefixo `/v1` |

### Endpoints ativos
| Método | Path | Fluxo | Latência típica |
|--------|------|-------|----------------|
| GET | `/v1/catalog` | Hub de capítulos | 1.4–1.9s |
| POST | `/v1/sessions` | Início de sessão | ~1s |
| GET | `/v1/sessions/{id}/lesson` | Carregamento de lição | ~700ms |
| POST | `/v1/sessions/{id}/complete` | Conclusão (fire-and-forget) | — |
| GET | `/v1/analytics/overview?days=N` | Dashboard | 0.5–1s |
| POST | `/v1/sessions/{id}/events` | Eventos MIDI | — |

### Headers
- `x-external-auth: Bearer <token>` — token do Supabase externo, repassado como `Authorization` pelo proxy
- `apikey: <anon_key>` — anon key do Lovable Cloud para autenticar na Edge Function
- `Idempotency-Key` — usado em POST `/complete`

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
| `enableGuestMode` | `false` | Permite navegação limitada sem login |

### featureFlagSnapshot em index.tsx

`featureFlagSnapshot` é a variável que o handler MIDI consulta para decidir branches de execução. Ela é atualizada via `featureFlags.subscribe()` e reflete mudanças em tempo real (inclusive via `window.__flags.set()`). Toggles de Step Quality (`useStepQualityStreak`, `showStepQualityFeedback`) também estão disponíveis no menu de debug do HUD (HTML).

---

## HUD UX — Score/Streak/Status (corrigido 2026-04-08)

O `UIService` (`src/viewer/ui-service.ts`) implementa:

| Comportamento | Regra |
|--------------|-------|
| Score visibility | **Sticky:** uma vez exibido, permanece visível mesmo se `updateHud` omitir `scoreTotal` |
| Streak visibility | **Sticky:** idem score |
| Status terminal | `FINISHED`/`DONE` bloqueiam sobrescrita por estados transitórios |
| Reset | `RESET` limpa lock terminal + sticky flags |

### Armadilhas
- Chamar `updateHud({ status: "FINISHED" })` sem `scoreTotal` **não** esconde mais o score (fix 2026-04-08)
- O status não "pisca" mais entre `HIT` e `WAITING` após `FINISHED`

### Testes
- `hud-score-visibility-regression.test.ts`
- `hud-status-priority-regression.test.ts`
- `hud-streak-combo-regression.test.ts`

---

## Step Quality UX/HUD — Comportamento Real

### Pré-condições para o feedback visual (atualizado 2026-04-08)

**Note feedback (✓/✗)** — requer apenas:
1. **Flag `showStepQualityFeedback` = true**
2. **Modo WAIT** (FILM usa streak legado)
3. Funciona para **V1 e V2**

**Quality badge (Perfeito/Ótimo/Boa/Recuperou)** — requer adicionalmente:
4. **Flag `useStepQualityStreak` = true**
5. **Lição V2** (`currentSchemaVersion === 2`)

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

## Audio Pipeline (atualizado 2026-04-08)

### Arquitetura

```
Input (mouse/keyboard/MIDI) → handleNoteInput() → audioService.playMidiNote() / stopNote()
                                                 → engine.onMidiInput() (lógica)
                                                 → Step Quality feedback (visual)
```

**Decisão arquitetural:** `handleNoteInput` em `index.tsx` é o ponto único de áudio. O `piano-roll-controller` NÃO toca áudio diretamente (evita double-trigger).

### AudioService (`src/viewer/audio-service.ts`)

| Aspecto | Implementação |
|---------|--------------|
| Síntese | Layered: triangle (fund.) + sine (2x, 15%) + sine (3x, 5% decay rápido) |
| Compressor | DynamicsCompressorNode (-24dB threshold, ratio 4:1) |
| Envelope | ADSR adaptativo: attack 8ms, decay/release escalam com duração |
| Velocity | Curva quadrática: `(v/127)² × 0.35` |
| Auto-play falling | `getAutoPlayFalling()` — OFF por padrão |

### Guards de áudio
- `audioService.getEnabled()` — master gate (toggle do usuário)
- `audioService.getAutoPlayFalling()` — gate para auto-play de falling notes no piano-roll

### Testes
- `audio-input-pipeline.test.ts` — estado, gates, convergência
- `audio-step-quality-convergence.test.ts` — source independence, anti-double-trigger

---

## Guards que bloqueiam execução em index.tsx

O handler MIDI em `index.tsx` tem múltiplos guards. Para debugging, verificar:

1. `featureFlagSnapshot.showStepQualityFeedback` — bloqueia note feedback se off
2. `featureFlagSnapshot.useStepQualityStreak` — bloqueia quality badge se off
3. `currentSchemaVersion === 2` — bloqueia quality badge (V2-only); note feedback funciona em V1
4. `currentMode === 'WAIT'` — bloqueia FILM
5. `engine !== null` — bloqueia se engine não inicializado
6. `engine.isEnded()` — bloqueia após fim da lição

### Flag toggle subscriber (anti-flicker, corrigido 2026-04-08)

O subscriber de `featureFlags.subscribe()` compara `prevFlagSnapshot` vs `next` antes de reconstruir sheet/pianoRoll. Flags não relacionadas **não** causam rebuild da partitura.

---

## Testes

```bash
npx vitest run                           # Suíte completa (370+ testes, 36 arquivos)
npx vitest run src/viewer/__tests__/     # Apenas viewer
```

**Cobertura importante ausente:** `index.tsx` não tem testes diretos. Bugs de wiring (controllers, snapshots, guards) só são detectáveis por inspeção manual ou testes de integração.

**Módulos com testes obrigatórios:** `lesson-engine`, `auth-storage`, `analytics-client`, `beat-to-x-mapping`, `lesson-transposer`, `catalog-service`, `ui-service`, `audio-service`.

### Testes anti-regressão recentes (2026-04-08)
- `flag-toggle-sheet-flicker-regression.test.ts` — flag toggle não causa rebuild de sheet
- `step-quality-v1-feedback-regression.test.ts` — V1 recebe note feedback
- `step-quality-wiring-regression.test.ts` — guard matrix atualizada para V1 feedback
