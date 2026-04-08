# AGENTS.md

Guia operacional para agentes de IA e desenvolvedores que vão trabalhar neste repositório com segurança, contexto e consistência.

> **Última atualização:** 2026-04-08 — HUD UX fixes (score/streak sticky, status priority, Step Quality flag toggles).

---

## 1. Visão geral do projeto

**Piano Trainer** é um aplicativo web de prática de piano que guia o aluno por lições organizadas em capítulos (trails), exibindo partituras musicais (MusicXML via OSMD) e "falling notes" (piano roll) em tempo real enquanto recebe input MIDI do teclado do usuário.

### Problema que resolve
Permite praticar piano com feedback imediato (HIT/MISS/LATE), rastreamento de progresso, analytics de desempenho e gamificação (streaks, scores, stars, badges).

### Stack principal
| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS |
| UI Components | Radix UI (shadcn), Framer Motion, Recharts |
| Auth & DB | Lovable Cloud (Supabase managed) |
| MIDI | Web MIDI API (`webmidi-service.ts`) |
| Sheet Music | OSMD (OpenSheetMusicDisplay) |
| Testes | Vitest + jsdom (339+ testes, 32 arquivos) |

> **Nota:** Este projeto consome um backend FastAPI externo em `api.devoltecomele.com` via Edge Function proxy (`api-proxy`). O catálogo, sessões e analytics vêm do backend (fonte única de verdade). O proxy resolve CORS em preview e produção. `assets/lessons.json` é usado apenas para indexação estática de metadados de trail chapters.

### Módulos principais
- **`src/viewer/`** — Núcleo funcional: motores de lição (V1/V2), MIDI, piano roll, OSMD, transport, analytics, auth, endscreen, feature flags, catálogo.
- **`src/viewer/catalog/`** — Camada de catálogo: tipos, adapter local, serviço centralizado.
- **`src/config/`** — Configuração desacoplada de runtime (`app-config.ts`).
- **`src/components/`** + **`src/pages/`** — UI React convencional (dashboard, lessons hub, login, settings).
- **`viewer/`** (raiz) — **LEGADO.** Cópia antiga do viewer com build independente. **NÃO é o entrypoint.** `src/viewer/` é canonical. Candidata a remoção.

### Fluxo de alto nível
```
[Usuário] → MIDI Keyboard → WebMidiService → LessonEngine (V1 ou V2)
                                                   ↕
[Backend API] → api-proxy (Edge Function) → proxyFetch → CatalogService → Trail[] → TrailNavigator/Hub UI
                                                   ↕
[OSMD] → Partitura renderizada → beat-to-x-mapping → Falling Notes / Cursor
                                                   ↕
[Auth] → Lovable Cloud (Supabase externo) → token → x-external-auth → backend
```

---

## 2. Arquitetura real do repositório

### Mapeamento de pastas

| Caminho | Responsabilidade |
|---------|-----------------|
| `src/main.tsx` | **Entrypoint real.** Carrega `loadRuntimeConfig()` → valida → importa `src/viewer/index.tsx` |
| `src/viewer/index.tsx` | Orquestrador principal (~3000 linhas). Monta DOM, inicia MIDI, transport, engine, renderiza Home/Hub/Dashboard/Trainer. |
| `src/viewer/catalog-service.ts` | **Serviço central de catálogo.** Carrega do backend via `proxyFetchJson('/v1/catalog')`. Sem fallback local — backend é fonte única. Indexa metadados estáticos de `lessons.json` para TrailNavigator. |
| `src/viewer/catalog/types.ts` | Tipos do catálogo: `Trail`, `TrailLevel`, `TrailModule`, `TrailChapter`, `HandAssignment`. |
| `src/viewer/catalog/adapter.ts` | Adapter: converte catálogo local → `Trail[]` hierárquico. |
| `src/viewer/catalog/local-catalog.ts` | Builder: lê `assets/lessons.json` e monta estrutura normalizada (`tracks[]`, `chapters[]`, `lessons[]`). |
| `src/viewer/components/TrailNavigator.tsx` | Componente completo de navegação: overlay com level tabs, módulos acordeão (framer-motion), cards de capítulo com badges/progresso, card "Recomendado", hand badges. Usa classes CSS de `styles.css`. |
| `src/viewer/lesson-engine.ts` | Motor de lição V1 (monofônico) e V2 (polifônico/acordes). WAIT + FILM modes. |
| `src/viewer/lesson-pipeline.ts` | Parser + roteador automático V1/V2 baseado em heurística. |
| `src/viewer/beat-to-x-mapping.ts` | Mapeia beat musical → posição X na tela (critical para falling notes + cursor). |
| `src/viewer/analytics-client.ts` | Cliente de analytics: `fetchOverview()` via `proxyFetch`, cache por user, fallback estático configurável. |
| `src/viewer/auth-storage.ts` | Extração de token JWT de múltiplas chaves de storage (legado + dinâmico Supabase). |
| `src/viewer/auth/` | Auth gate: login/registro via Supabase. **Non-blocking** — app funciona sem sessão. |
| `src/viewer/transport/` | Abstração REST/WebSocket (`factory.ts` detecta automaticamente). |
| `src/viewer/services/taskCompletion.ts` | Cálculo de resultado (score, stars, high score, per-note stats). |
| `src/viewer/services/lesson-transposer.ts` | Transposição imutável de lições (clamp MIDI 21-108). |
| `src/viewer/feature-flags/` | Feature flags com 4 camadas: default → localStorage → remote → runtime. |
| `src/viewer/components/Endscreen/` | Tela de resultado pós-lição. |
| `src/viewer/lesson-timer.ts` | Timer com start/stop/reset, tick a cada 100ms. |
| `src/config/app-config.ts` | Configuração centralizada: `window.__APP_CONFIG__` → `/config.json` → `import.meta.env`. |
| `src/hooks/useLessons.ts` | Hook React: `buildLocalCatalog()` → `adaptCatalogToTrails()` → `Trail[]`. |
| `src/pages/LessonsHubPage.tsx` | Página de catálogo React: consome `useLessons()` e renderiza capítulos reais. |
| `src/viewer/__tests__/` | 32 arquivos de teste Vitest cobrindo regressões críticas. |
| `public/config.json` | Config de runtime (Supabase URL, analytics mode). |
| `assets/` | Metadados estáticos do currículo. `lessons.json` usado para indexação de trail chapters. **Não é mais fonte primária** — backend é fonte única. |
| `src/viewer/proxy-fetch.ts` | **Utilitário centralizado de fetch via proxy.** Todas as chamadas `/v1/*` passam por aqui → Edge Function `api-proxy` → backend. Injeta `x-external-auth` + `apikey`. |
| `supabase/functions/api-proxy/index.ts` | **Edge Function proxy genérica.** Encaminha qualquer método/path para `api.devoltecomele.com`. Resolve CORS. |
| `viewer/` (raiz) | **LEGADO.** Não usar. `src/viewer/` é o canonical. |

### Pipeline do catálogo (backend-first)
```
Backend API (api.devoltecomele.com)
  → Edge Function api-proxy           # supabase/functions/api-proxy/index.ts
  → proxyFetchJson('/v1/catalog')      # src/viewer/proxy-fetch.ts
  → CatalogService.load()             # src/viewer/catalog-service.ts
    → { tracks[], chapters[], lessons[] }
  → buildTrailsFromCatalog()           # Monta Trail[] a partir de tracks + chapters
  → TrailNavigator / LessonsHubPage / piano-pro-hub

  // Metadados estáticos (lessons.json) usados apenas para indexação
  // de TrailChapter metadata (hand, difficulty, etc.)
```

### Pipeline de rede (todas as chamadas /v1/*)
```
Frontend (proxyFetch)
  → GET/POST https://{supabase-url}/functions/v1/api-proxy/v1/{path}
    Headers: apikey (anon), x-external-auth (Bearer token externo)
  → Edge Function api-proxy
    → Forward para https://api.devoltecomele.com/v1/{path}
    Headers upstream: Authorization (from x-external-auth), Content-Type, Idempotency-Key
  → Response: status + body repassados com CORS headers
```

### Entrypoints
1. **Web (Lovable/Vite):** `index.html` → `src/main.tsx` → `src/viewer/index.tsx`

### Dependências críticas entre camadas
- `lesson-engine.ts` **não depende** de DOM/React — é testável isoladamente.
- `beat-to-x-mapping.ts` **depende** de `OsmdController` (DOM) — difícil de testar unitariamente sem mock.
- `analytics-client.ts` depende de `auth-storage.ts` → `getAuthTokenFromStorage()` e de `proxyFetch`.
- `catalog-service.ts` depende de `proxyFetchJson` para carregar do backend. Retorna `[]` se backend indisponível.
- `proxy-fetch.ts` depende de `supabase/client.ts` (URL) e `auth-storage.ts` (token externo).
- `index.tsx` é o "god file" que conecta tudo — modificar com extremo cuidado.

---

## 3. Como rodar o projeto

### Pré-requisitos
- Node.js (18+) + npm

### Instalação
```bash
npm install
```

### Variáveis de ambiente
| Variável | Onde | Propósito |
|----------|------|-----------|
| `VITE_SUPABASE_URL` | `.env` (auto-gerado) | URL do Lovable Cloud |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` (auto-gerado) | Anon key |
| `VITE_SUPABASE_PROJECT_ID` | `.env` (auto-gerado) | Project ID |

> **NUNCA editar `.env` manualmente.** É gerenciado pelo Lovable Cloud.

### Comandos de desenvolvimento
```bash
npm run dev          # Vite dev server (porta 8080)
npm run build        # Build de produção
npx vitest run       # Executar todos os testes
```

---

## 4. Build, testes e validação

### Build
```bash
npm run build        # Produção
```

### Testes
```bash
npx vitest run                                    # Suíte inteira (339+ testes)
npx vitest run src/viewer/__tests__/              # Apenas testes do viewer
npx vitest run src/viewer/__tests__/polyphony     # Arquivo específico
npx vitest --watch                                # Watch mode
```

### Cobertura de testes atual (32 arquivos)
| Arquivo | Cobertura |
|---------|-----------|
| `auth-storage.test.ts` | Token extraction, sync, clear, nested structures |
| `auth-storage-senior.test.ts` | Custom domain fallback, atomicidade do sync |
| `analytics-client.test.ts` | buildHeaders real, fetchOverview, cache, fallback |
| `badge-independence.test.ts` | MIDI vs Backend badges independentes |
| `beat-to-x-mapping-fallbacks.test.ts` | Monotonicidade, fallback triggers |
| `bootstrap-regression.test.ts` | Boot shell, auth gate z-index, single init guard, route activation |
| `catalog-service.test.ts` | Cache, dedup, chapter→lesson mapping, indexação estática, fallback local |
| `complete-payload-invariants.test.ts` | local_date São Paulo, fire-once guard |
| `dashboard-ux-regression.test.tsx` | Dashboard UX rendering |
| `feature-flags-layers.test.ts` | Precedência de 4 camadas, JSON corrompido |
| `feature-flags-step-quality-menu-regression.test.ts` | Toggles de Step Quality no menu UI |
| `feature-flags-subscribe.test.ts` | Subscribe reativo no flag store |
| `fire-and-forget-complete.test.ts` | POST /complete resiliente a falhas |
| `hand-split-rule.test.ts` | C4 (60) = mão direita |
| `hud-score-visibility-regression.test.ts` | Score sticky visibility, não desaparece em FINISHED |
| `hud-status-priority-regression.test.ts` | FINISHED terminal, não sobrescrito por HIT/WAITING |
| `hud-streak-combo-regression.test.ts` | Streak sticky, reset sem esconder, não some em FINISHED |
| `lesson-engine-invariants.test.ts` | Score, streak, AttemptLog, forceEnd |
| `lesson-engine-timer-integration.test.ts` | Integração engine + timer |
| `lesson-session-controller.test.ts` | Controlador de sessão |
| `lesson-timer.test.ts` | Timer unitário |
| `lesson-timer-regression.test.ts` | Timer básico com fake timers |
| `midi-onboarding-controller.test.ts` | MIDI onboarding flow controller |
| `midi-onboarding-runtime.test.tsx` | MIDI onboarding runtime React |
| `midi-onboarding.test.ts` | MIDI onboarding integration |
| `polyphony-chords.test.ts` | Chord expansion, PARTIAL_HIT, miss window |
| `progress-index.test.ts` | Progress index calculations |
| `step-quality-engine.test.ts` | Step quality classification engine |
| `step-quality-ui.test.ts` | Step quality UI controllers |
| `step-quality-wiring-regression.test.ts` | Step quality wiring guards |
| `task-completion-v2-scoring.test.ts` | V2 scoring contract |
| `timer-regression-end-state.test.ts` | shouldStartTimer guard, timer pós-ended |
| `transposition-pipeline.test.ts` | clampMidi, V1/V2, imutabilidade |

### Validação manual antes de entregar
- [ ] Capítulos aparecem no Hub (LessonsHubPage ou TrailNavigator)
- [ ] Agrupamento por trilha/nível/módulo correto
- [ ] Capítulos com `coming_soon` não quebram
- [ ] Capítulos sem metadados opcionais renderizam
- [ ] Seleção de capítulo resolve `chapterId → lessonId`
- [ ] App funciona 100% sem backend
- [ ] Endscreen aparece mesmo com falha de rede

---

## 5. Convenções de desenvolvimento

### Padrões de código
- TypeScript strict (exceto `src/viewer/index.tsx` que usa `@ts-nocheck`)
- Imports com alias `@/` para `src/`
- Nomes de arquivo: kebab-case (`lesson-engine.ts`, `beat-to-x-mapping.ts`)
- Componentes React: PascalCase (`EndscreenV2.tsx`, `TrailNavigator.tsx`)
- Testes: `__tests__/` com sufixo `.test.ts`

### Organização de responsabilidades
- **Lógica pura** em arquivos dedicados (`lesson-engine.ts`, `lesson-transposer.ts`, `auth-storage.ts`)
- **Catálogo** em `src/viewer/catalog/` (tipos, adapter, local-catalog) + `catalog-service.ts`
- **Efeitos colaterais** concentrados em `index.tsx` (o orquestrador)
- **Configuração** sempre via `app-config.ts` (nunca acessar `import.meta.env` direto em outros arquivos)
- **Estado de storage** (localStorage) isolado por chaves com prefixo (`stats_cache_v1_`, `hs_`, `bt_`)

### Como adicionar features
1. Extrair lógica pura em módulo testável
2. Escrever testes Vitest **antes** de integrar em `index.tsx`
3. Usar feature flag se o comportamento for experimental
4. Manter imutabilidade (especialmente em transposição e engine)

### Como corrigir bugs
1. Reproduzir com teste unitário (Given/When/Then)
2. Aplicar fix mínimo
3. Verificar que teste passa
4. Checar regressões nos testes existentes

---

## 6. Fluxos críticos do sistema

### 6.1 Autenticação (non-blocking)
```
src/main.tsx
  → loadRuntimeConfig()         # Carrega /config.json
  → validateConfig()            # Checa supabaseUrl + anonKey
  → import src/viewer/index.tsx
    → ensureAuthenticated()     # Tenta verificar sessão
      → Se config ausente: resolve silenciosamente (app continua)
      → Se sem sessão: resolve silenciosamente (app continua)
      → Se com sessão: syncSessionToLegacyStorage()
    → init()                    # SEMPRE executa, independente de auth
```

> **Decisão arquitetural:** Auth é non-blocking. O app funciona sem sessão ativa. Isso permite que o catálogo local e a navegação funcionem 100% offline.

### 6.2 Carregamento de catálogo (backend-first via proxy)
```
init()
  → requestChapterCatalog()
  → catalogService.load()             # src/viewer/catalog-service.ts
    → proxyFetchJson('/v1/catalog')    # src/viewer/proxy-fetch.ts
      → Edge Function api-proxy       # supabase/functions/api-proxy/index.ts
        → GET https://api.devoltecomele.com/v1/catalog
    → buildChapterLessonMap()          # Indexa chapter_id → lesson_id
    → catalog cached in memory
  → catalogService.getTrails()
    → buildTrailsFromCatalog()         # Monta Trail[] a partir de tracks[] + chapters[]
  → Renderiza TrailNavigator / LessonsHubPage
```

> **Decisão arquitetural:** O backend é a fonte única de verdade para o catálogo. Se o backend falhar, a lista de capítulos fica vazia.

### 6.3 Início de sessão de prática
```
Usuário seleciona capítulo no Hub
  → getChapterLessonId()    # Resolve chapter → lesson_id (local map ou fallback lesson_{id})
  → parseAndRoute()         # Auto-detecta V1 ou V2
    → Se V2: pipelineV2() → createEngineV2() → loadLesson()
    → Se V1: pipelineV1() → createEngineV1() → loadLesson()
  → buildBeatToXMapping()   # OSMD cursor scan → mapping
  → deriveRenderNotesFromV2Steps()
  → Inicia LessonTimer
```

### 6.4 Input MIDI durante prática
```
WebMidiService.onNoteOn(midi, velocity)
  → pushEvent('note_on')
  → engine.onMidiInput(midi, velocity, true)
    V2: Verifica se midi está no chord do step atual
      → Se sim e todas as notas do chord foram tocadas: HIT, avança step
      → Se sim mas incompleto: PARTIAL (não avança)
      → Se errado: MISS (reseta stepState)
    → logAttempt() no AttemptLog
  → Atualiza HUD (score, streak, feedback visual)
  → Se engine ended: forceEnd() → notifyEnded() → Endscreen
```

### 6.5 POST /complete (fire-and-forget)
```
Engine ended (setupEngineEndCallback em index.tsx)
  → sessionController.endLesson("COMPLETE")
  → engine.getAttemptLog() → attempts válidos
  → engine.getCompletedSteps() → completedSteps (V2 only)
  → engine.getTotalExpectedNotes() → totalExpectedNotes (V2 only)
  → computeTaskResult(attempts, totalSteps, mode, ..., engineStats)
  → dispatchTaskCompletion(result)
  → POST /v1/sessions/{session_id}/complete (fire-and-forget, inline em index.tsx)
    → Headers: Authorization: Bearer <token>, Idempotency-Key: crypto.randomUUID()
    → Payload: { completed_at, duration_ms, summary: { pitch_accuracy, timing_accuracy, avg_latency_ms, std_latency_ms, hits, misses }, attempts_compact }
    → Guard: `completeSent` flag impede envio duplicado na mesma sessão
    → Guard: sem session_id ou sem token → skip com log
    → Falha de rede: log "[Complete] failed", NÃO bloqueia Endscreen
  → showEndscreen(result) — SEMPRE executa, independente do POST
```

### 6.5.1 Scoring Contract (V2)
- `AttemptLog` **não é** fonte de verdade para `correctSteps` em V2.
- Em lições polifônicas, MISS + retry deixam histórico no log, mas o engine já sabe quantos steps foram completados.
- Fonte de verdade:
  - `engine.getCompletedSteps()` → `correctSteps` (incrementa exatamente 1x por step completado)
  - `engine.getTotalExpectedNotes()` → `totalExpectedNotes` (derivado de `sum(step.notes.length)`)
- `computeTaskResult()` usa `AttemptLog` apenas para derivar `correctNotes` contando notas esperadas únicas satisfeitas (sem inflar por retries/duplicatas).
- Fallback legado sem `engineStats` permanece disponível para compatibilidade de testes.
- Testes: `src/viewer/__tests__/task-completion-v2-scoring.test.ts`

### 6.6 Feature flags
```
featureFlags.init(remoteProvider?)
  1. DEFAULT_FLAGS (hardcoded)
  2. localStorage (LocalFeatureFlagProvider)
  3. Remote provider (se configurado)
  4. Runtime: window.__flags.set('showSheetMusic', false, 'runtime')
```

---

## 7. Fontes de verdade do sistema

| O quê | Onde |
|-------|------|
| **Currículo / lições** | Backend API `/v1/catalog` via `api-proxy` **(fonte única)** |
| Tipos do catálogo | `src/viewer/catalog/types.ts` |
| Tipos do domínio musical | `src/viewer/types.ts` |
| Tipos do task/endscreen | `src/viewer/types/task.ts` |
| Tipos de analytics | `src/viewer/analytics-client.ts` (interfaces inline) |
| Tipos de auth | `src/viewer/auth/types.ts` |
| Serviço de catálogo | `src/viewer/catalog-service.ts` (carrega via `proxyFetchJson`) |
| Proxy centralizado | `src/viewer/proxy-fetch.ts` (todas as chamadas /v1/*) |
| Edge Function proxy | `supabase/functions/api-proxy/index.ts` |
| Adapter local (metadados) | `src/viewer/catalog/adapter.ts` + `local-catalog.ts` |
| Config de runtime | `src/config/app-config.ts` (AppConfig interface) |
| Config publicada | `public/config.json` |
| Feature flags | `src/viewer/feature-flags/types.ts` (FeatureFlags) |
| Engine de lição (lógica central) | `src/viewer/lesson-engine.ts` |
| Mapeamento beat→X | `src/viewer/beat-to-x-mapping.ts` |
| Transposição | `src/viewer/services/lesson-transposer.ts` |
| Auth storage | `src/viewer/auth-storage.ts` |
| HUD service | `src/viewer/ui-service.ts` (score/streak sticky, status priority) |
| Supabase types (auto-gerado) | `src/integrations/supabase/types.ts` (**NÃO editar**) |
| Supabase client (auto-gerado) | `src/integrations/supabase/client.ts` (**NÃO editar**) |

---

## 8. Regras para agentes de IA

### Obrigatórias
1. **Sempre ler o arquivo antes de alterar.** Nunca assumir conteúdo baseado no nome.
2. **Nunca editar arquivos auto-gerados:** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`.
3. **Respeitar a hierarquia de config:** `window.__APP_CONFIG__` → `/config.json` → `import.meta.env`. Nunca ler `import.meta.env` diretamente fora de `app-config.ts`.
4. **Preferir mudanças mínimas.** O princípio do projeto é "adaptar o ambiente ao app, não o app ao ambiente."
5. **Não renomear pastas/arquivos em `src/viewer/`.** A estrutura é preservada para portabilidade entre plataformas.
6. **Testes obrigatórios** ao mudar `lesson-engine.ts`, `auth-storage.ts`, `analytics-client.ts`, `beat-to-x-mapping.ts`, `lesson-transposer.ts`, `catalog-service.ts`, `ui-service.ts`.
7. **Nunca armazenar secrets em código.** Usar `public/config.json` para chaves públicas (anon key).
8. **Imutabilidade:** `LessonTransposer.transpose()` retorna clone. Engine não muta input. Manter esse padrão.
9. **Fire-and-forget:** POST `/v1/sessions/{id}/complete` nunca deve bloquear a UI. Falhas são logadas, não lançadas. Guard `completeSent` impede duplicidade.
10. **Feature flags:** Novas features experimentais devem ser protegidas por flag em `src/viewer/feature-flags/types.ts`.
11. **Backend é fonte única do catálogo:** `CatalogService.getTrails()` retorna `[]` se o backend não respondeu. Não há fallback local. `assets/lessons.json` é usado apenas para metadados estáticos de trail chapters.
12. **Todas as chamadas /v1/* via proxy:** Usar `proxyFetch()` ou `proxyFetchJson()` de `src/viewer/proxy-fetch.ts`. Nunca chamar `api.devoltecomele.com` diretamente do browser.
13. **`viewer/` (raiz) é legado.** Sempre editar `src/viewer/`. Nunca editar `viewer/`.
14. **Edge Function `api-proxy`** é o ponto único de saída para o backend. Não criar proxies adicionais para endpoints individuais.

### Processo de correção de bugs
1. **Diagnosticar:** Ler logs, checar storage, validar env vars e feature flags.
2. **Isolar:** Reproduzir com teste unitário.
3. **Planejar:** Identificar ponto de entrada e consumidores afetados.
4. **Implementar:** Fix mínimo + teste.
5. **Proteger:** Adicionar teste anti-regressão que falha sem o fix e passa com ele.
6. **Validar:** `npx vitest run` (todos os testes devem passar).

---

## 8.1 TDD and Anti-Regression Policy

### Princípios

1. **Anti-regressão é parte do processo, não pós-pensamento.** Bug corrigido sem teste anti-regressão precisa de justificativa explícita.
2. **Nem todo bug pede refactor; muitos pedem teste cirúrgico.** O objetivo é impedir que o mesmo bug reabra, não reescrever o sistema.
3. **Unit test sozinho não substitui teste de integração/wiring.** Se o bug nasceu na camada de wiring (ex: `index.tsx`), o teste precisa simular o wiring, não só o módulo isolado.
4. **Testar comportamento observável, não detalhes internos.** Acoplamento a implementação gera testes frágeis.
5. **Testes verdes não bastam se a área alterada não está coberta.** A suíte pode estar 100% verde e o bug existir em camada sem cobertura.

### Quando testes são obrigatórios

| Situação | Tipo de teste mínimo |
|----------|---------------------|
| Mudança em módulo crítico (`lesson-engine`, `auth-storage`, `analytics-client`, `beat-to-x-mapping`, `lesson-transposer`, `catalog-service`, `taskCompletion`, `ui-service`) | Unit test |
| Bug fix em qualquer módulo | Anti-regression test (deve falhar sem o fix) |
| Mudança em feature flags | Teste de combinação de flags (ON/OFF matrix) |
| Mudança em guards de `index.tsx` | Teste de wiring simulando o contrato do handler |
| Mudança em lifecycle/boot | Teste de inicialização com flags em estados diferentes |
| Nova feature experimental | Teste de comportamento + flag gate |

### Tipos de teste no projeto

| Tipo | Quando usar | Exemplo |
|------|------------|---------|
| **Unit test** | Lógica pura sem dependência de DOM/wiring | `lesson-engine-invariants.test.ts` |
| **Integration test** | Múltiplos módulos colaborando | `lesson-engine-timer-integration.test.ts` |
| **Anti-regression test** | Reproduzir bug específico e impedir reabertura | `step-quality-wiring-regression.test.ts` |
| **Wiring test** | Simular contrato do entrypoint/handler sem importar `index.tsx` | `step-quality-wiring-regression.test.ts` (guard matrix) |
| **Runtime test** | Validar comportamento com DOM simulado + fake timers | `step-quality-ui.test.ts` |

### Áreas de risco elevado (exigem atenção extra)

- **Entrypoints** (`index.tsx`): god file com closures, guards, snapshots. Bugs aqui não são detectáveis por unit tests isolados.
- **Feature flags**: combinações de flags podem criar branches não testados. Toda nova flag deve ter teste de matrix.
- **UI wiring**: controllers criados condicionalmente, snapshots congelados, subscribe esquecido.
- **Runtime guards**: `shouldStartTimer`, `completeSent`, `isEnded`, schema/mode checks.
- **State/lifecycle**: boot, reset, destroy, re-init, timer cleanup.

### Quality Gates

Antes de considerar uma mudança "pronta":

1. **Bug fix → teste anti-regressão existe?** Se não, justificar por que é dispensável.
2. **Mudança em entrypoint/wiring → integração considerada?** Unit test isolado pode não capturar o bug.
3. **Mudança em feature flags → matrix testada?** Pelo menos: ambas OFF, ambas ON, cada uma isolada.
4. **Mudança em guard → branch crítico testado?** O guard que bloqueia execução precisa de teste que prove que bloqueia.
5. **Mudança em lifecycle → cleanup testado?** destroy/reset com timer pendente não pode crashar.
6. **Suíte verde → área alterada está coberta?** Verde ≠ seguro se a área não tem teste.

### Handoff entre agentes

```
bug-investigator → identifica causa raiz, propõe fix mínimo
  → orchestrator → define escopo, delega implementação
    → implementer (viewer-engineer, lesson-engine-specialist, etc.) → aplica patch
      → tdd-engineer → escreve testes anti-regressão
        → regression-auditor → valida que testes realmente blindam a regressão
          → code-reviewer → valida qualidade final (código + testes)
```

Regras de handoff:
- Implementador **não encerra** sem considerar cobertura de teste.
- Se o implementador também escreve o teste, `regression-auditor` valida independentemente.
- `code-reviewer` cobra qualidade de testes, não só qualidade de código.
- Bug corrigido sem teste → `code-reviewer` pode bloquear.

---

## 9. Checklist antes de alterar qualquer coisa

- [ ] Entendi o fluxo completo do código que vou alterar?
- [ ] Identifiquei o ponto de entrada (é em `index.tsx`? Em um módulo isolado?)
- [ ] Li os tipos relevantes (`types.ts`, `catalog/types.ts`, `types/task.ts`)?
- [ ] Li os serviços que consomem este módulo?
- [ ] Confirmei impacto nos testes existentes?
- [ ] Verifiquei se há feature flag que controla este comportamento?
- [ ] Há risco de quebrar fluxo legado (V1 vs V2)?
- [ ] Há impacto em analytics, auth, storage ou catálogo?
- [ ] O arquivo `index.tsx` (2800 linhas) será afetado? Se sim, extra cuidado.
- [ ] Estou editando `src/viewer/` (correto) e não `viewer/` (legado)?

---

## 10. Checklist antes de entregar uma alteração

- [ ] `npm run build` compila sem erros?
- [ ] `npx vitest run` — todos os testes passam?
- [ ] Não há imports mortos ou variáveis não usadas?
- [ ] Não há hardcode de URLs, tokens ou credenciais?
- [ ] Não há regressão nos fluxos críticos (catalog, engine, timer)?
- [ ] Se adicionei lógica nova, existe teste cobrindo?
- [ ] Se alterei engine/transposer/analytics/catalog, teste de invariante atualizado?
- [ ] Documentação (AGENTS.md, CHANGELOG.md) precisa ser atualizada?

---

## 11. Armadilhas e cuidados do projeto

### Duplicação `src/viewer/` vs `viewer/`
- **`src/viewer/` é canonical.** A pasta `viewer/` na raiz é legado com build independente e **pode estar desatualizada**. Sempre editar em `src/viewer/`. A pasta `viewer/` é candidata a remoção futura.

### index.tsx é um god file
- `src/viewer/index.tsx` tem ~2800 linhas com `@ts-nocheck`. Modificar com extremo cuidado. Preferir extrair lógica para módulos dedicados antes de adicionar funcionalidade aqui.
- **Bugs de wiring neste arquivo não são detectáveis por testes unitários.** Se algo "deveria funcionar" mas não aparece na UI, inspecionar `index.tsx` primeiro: guards, condicionais de boot, snapshots congelados, controllers não instanciados.
- **Diagnóstico rápido para bugs de UI/flag:** verificar nesta ordem: (1) flag está ativa? (`window.__flags.snapshot()`), (2) elemento DOM existe? (`document.getElementById(...)`), (3) controller foi instanciado? (logs de boot), (4) guard de schema/mode está bloqueando? (logs de MIDI handler).

### Auth é non-blocking
- `ensureAuthenticated()` resolve silenciosamente se não houver config ou sessão. O app continua normalmente. Isso é **intencional** — permite funcionamento offline do catálogo e navegação.

### Auth storage com múltiplas chaves
- O sistema precisa ler tokens de 5+ chaves diferentes (legado + Supabase dinâmico) em `sessionStorage` e `localStorage`.
- A chave dinâmica (`sb-{ref}-auth-token`) depende de `VITE_SUPABASE_URL` bater com padrão `*.supabase.co`.
- **Custom domains** (ex: `auth.meudominio.com`) fazem a chave dinâmica retornar `null` → cai no fallback legado. Isso é intencional.

### Timer restart bug (P0 histórico)
- Eventos MIDI tardios (depois do engine DONE) podem reiniciar o `LessonTimer` se o guard `shouldStartTimer(isRunning, engineEnded)` não for respeitado.
- Nunca remover essa checagem.

### Polifonia V2 — PARTIAL_HIT
- Em acordes, o step só avança quando **todas** as notas são tocadas.
- Se uma nota errada for tocada durante um chord parcial, é MISS e reseta o `stepState`.
- Duplicatas de nota são ignoradas (não contam 2x).

### Step Quality System (PR1 engine + PR2 UX/HUD)
- **Escopo:** Engine V2, modo WAIT polifônico apenas. FILM mode **não usa** Step Quality (usa streak legado). V1 implementa stubs (no-op).
- **Feature flags:**
  - `useStepQualityStreak` (default: `false`) — ativa scoring por qualidade de step no engine.
  - `showStepQualityFeedback` (default: `false`) — ativa feedback visual no HUD (badge, note feedback, chord closure).
- **Classificações por step completado:**
  - `PERFECT` — 0 hard errors, 0 soft errors
  - `GREAT` — 0 hard errors, ≤1 soft error
  - `GOOD` — ≤1 hard error
  - `RECOVERED` — 2+ hard errors
- **Soft errors:** duplicate notes, exploração inofensiva. **Hard errors:** notas fora do acorde.
- **Streak rules (flag ON):**
  - PERFECT/GREAT → streak +1
  - GOOD → streak mantém (ou -1 se streak ≥ 5, "damage")
  - RECOVERED → streak reseta a 0
  - Mid-step: se `hardErrorCount ≥ HARD_ERROR_BREAK_THRESHOLD` (3), streak quebra imediatamente
- **Estado:** `stepQualities` é array local do engine, não persiste em backend.
- **Interface:** `setUseStepQuality(enabled)` e `getStepQualities()` são obrigatórios na `LessonEngineApi`.
- **Controllers de UI:** `StepQualityBadgeController`, `NoteFeedbackController`, `ChordClosureEffect` (em `src/viewer/step-quality-ui.ts`).
  - Instanciados **sempre** no boot, independente do estado das flags (tolerantes a elemento DOM ausente).
  - Executam feedback apenas quando `featureFlagSnapshot.showStepQualityFeedback === true` no handler MIDI.
- **DOM elements:** `#hud-quality-badge`, `#judge-feedback`, `#hud-step`.
- **Armadilha histórica (corrigida 2026-03-12):** controllers eram criados condicionalmente no boot e `featureFlagSnapshot` era congelado no init. Mudanças de flag em runtime não tinham efeito. Fix: criação incondicional + `featureFlags.subscribe()` para manter snapshot vivo.
- **Arquivos:** `src/viewer/types/step-quality.ts`, `src/viewer/step-quality-ui.ts`, `src/viewer/lesson-engine.ts`, wiring em `src/viewer/index.tsx`.

### HUD UX — Score/Streak/Status (corrigido 2026-04-08)
- **Score e Streak usam visibilidade "sticky":** uma vez que `updateHud` recebe `scoreTotal` ou `streak`, o elemento fica visível permanentemente (mesmo se chamadas subsequentes omitirem esses campos, como no `FINISHED`).
- **Status tem prioridade terminal:** `FINISHED`/`DONE` não podem ser sobrescritos por estados transitórios (`HIT`, `WAITING`, etc.). Apenas `RESET` desbloqueia o status terminal.
- **RESET limpa todo o estado interno:** flags de sticky visibility, último valor de score/streak, e lock terminal.
- **Armadilha histórica (corrigida 2026-04-08):** `updateHud({ status: "FINISHED" })` sem `scoreTotal`/`streak` escondia os valores finais. O status piscava entre `HIT` e `WAITING` sem debounce.
- **Toggles de Step Quality no menu:** `index.html` agora inclui grupo "Step Quality" com toggles para `useStepQualityStreak` e `showStepQualityFeedback`, wired em `index.tsx` via `featureFlags.set()`.
- **Arquivo:** `src/viewer/ui-service.ts`
- **Testes:** `hud-score-visibility-regression.test.ts`, `hud-status-priority-regression.test.ts`, `hud-streak-combo-regression.test.ts`, `feature-flags-step-quality-menu-regression.test.ts`


- Se a taxa de match entre notas OSMD e steps for < 80%, fallbacks são acionados automaticamente.
- A monotonicidade (x nunca diminui com beat crescente) é crítica. Se quebrar, falling notes "voltam" na tela.
- Line breaks (sistemas diferentes na partitura) são tratados com `LINE_BREAK_THRESHOLD`.

### Catálogo — backend-first via proxy
- Backend (`/v1/catalog` via `api-proxy`) é a **fonte única** de verdade.
- `CatalogService.getTrails()` retorna `[]` se o backend não respondeu.
- `assets/lessons.json` é usado apenas para metadados estáticos de trail chapters (hand, difficulty, etc.).
- `CatalogService.getChapterLessonId()` usa o mapa indexado do backend.
- Todas as chamadas passam por `proxyFetch()` → Edge Function → backend.

### Proxy e CORS
- **`src/viewer/proxy-fetch.ts`** é o ponto centralizado de todas as chamadas `/v1/*`.
- Injeta `x-external-auth` (token do Supabase externo) e `apikey` (anon key do Lovable Cloud).
- **`supabase/functions/api-proxy/index.ts`** encaminha para `api.devoltecomele.com` com CORS `*`.
- Nunca chamar `api.devoltecomele.com` diretamente do browser — sempre via proxy.

### Analytics — timezone
- `local_date` deve ser calculado em `America/Sao_Paulo`, não UTC.
- O cache de analytics é isolado por `sub` do JWT. Se o sub mudar, cache antigo é descartado.

### Feature flags
- Flags atuais: `showSheetMusic`, `showFallingNotes`, `showNewCurriculum`, `showIntermediateCurriculum`, `useWebSocket`, `useStepQualityStreak`, `showStepQualityFeedback`.
- Precedência: `DEFAULT_FLAGS` → localStorage (`viewer:featureFlags:v1`) → remote provider → runtime (`window.__flags.set(...)`).
- `featureFlagSnapshot` em `index.tsx` é mantido atualizado via `featureFlags.subscribe()`. Mudanças em runtime refletem imediatamente no handler MIDI.
- Podem ser alteradas em runtime via `window.__flags.set(...)` (apenas em DEV).

---

## 12. Glossário do projeto

| Termo | Significado |
|-------|------------|
| **V1** | Schema de lição monofônico (1 nota por step). `LessonNote` com `midi: number`. |
| **V2** | Schema de lição polifônico (acordes). `LessonStepV2` com `notes: number[]`. |
| **WAIT mode** | Modo de prática onde o tempo para até o aluno tocar a nota correta. |
| **FILM mode** | Modo de prática em tempo real — notas descem e o aluno precisa tocar no timing certo. |
| **Step** | Unidade atômica de avaliação: 1 nota (V1) ou 1 acorde (V2). |
| **Trail** | Trilha de aprendizado: conjunto de levels → modules → chapters → lessons. |
| **Chapter** | Unidade de progressão. Cada chapter tem um `default_lesson_id`. |
| **TrailNavigator** | Componente que renderiza a hierarquia Trail[] para navegação. |
| **Adapter** | Camada que converte dados locais (`lessons.json`) para o formato `Trail[]`. |
| **OSMD** | OpenSheetMusicDisplay — renderizador de partituras MusicXML. |
| **Beat-to-X mapping** | Correspondência entre posição temporal (beat) e posição visual (pixels). |
| **Falling notes** | Visualização piano-roll: notas "caem" no canvas. |
| **AttemptLog** | Array de tentativas do aluno (midi, expected, success, responseMs). |
| **HIT/MISS/LATE** | Resultados de avaliação por nota/step. |
| **PARTIAL_HIT** | Estado intermediário: parte do acorde foi tocada mas não todas as notas. |
| **Fire-and-forget** | Padrão de POST que não bloqueia a UI em caso de falha. |
| **Cold start** | Primeiro carregamento do app. |
| **Endscreen** | Tela de resultado pós-lição (score, stars, high score, per-note stats). |
| **Transport** | Camada de comunicação com backend (REST ou WebSocket). Opcional neste projeto. |
| **Feature flag** | Toggle de funcionalidade com 4 camadas de precedência. |
| **HandAssignment** | `'right' \| 'left' \| 'both' \| 'alternate'` — qual mão o capítulo foca. |

---

## 13. Pendências e próximos passos

### Resolvido na migração recente
- ✅ Catálogo local funcional via `assets/lessons.json` → adapter → `Trail[]`
- ✅ Auth non-blocking — app funciona sem sessão
- ✅ `CatalogService` com `getTrails()`, `getTrailChapter()`, `getChapterLessonId()`
- ✅ `TrailNavigator` reescrito com UI rica: level tabs, módulos acordeão, card recomendado, badges de mão, progresso
- ✅ `useLessons()` hook consumindo pipeline local
- ✅ `LessonsHubPage` exibindo catálogo real
- ✅ Design system CSS consolidado em `src/viewer/styles.css` (neon glassmorphism, variáveis CSS, responsivo)
- ✅ POST `/v1/sessions/{id}/complete` fire-and-forget implementado no write path (`index.tsx`)
- ✅ Step Quality System (PR1): classificação PERFECT/GREAT/GOOD/RECOVERED, streak por qualidade de step, feature flag `useStepQualityStreak`
- ✅ Step Quality UX/HUD (PR2): controllers visuais (badge, note feedback, chord closure), feature flag `showStepQualityFeedback`, wiring corrigido para lifecycle reativo
- ✅ **API Proxy genérico** (`api-proxy`): todas as chamadas `/v1/*` passam pela Edge Function, resolvendo CORS em preview e produção
- ✅ **Backend como fonte única do catálogo**: `CatalogService` carrega do backend via `proxyFetchJson`, sem fallback local
- ✅ **`proxyFetch` centralizado**: utilitário único para todas as chamadas REST ao backend
- ✅ **Bootstrap determinístico** (2026-04-08): boot shell (`app-booting`), guard de inicialização única, auth gate z-index, sem flicker de UI
- ✅ **HUD UX fixes** (2026-04-08): score/streak sticky visibility, status terminal priority, Step Quality flag toggles no menu

### Candidato a remoção
- **`viewer/` (raiz):** Pasta legado inteira. `src/viewer/` é canonical.
- **`supabase/functions/catalog-proxy/`:** Substituída pelo `api-proxy` genérico.
- **Arquivos `.md` de análise na raiz:** `ANALISE-ARQUIVOS-LEGADOS.md`, `RESUMO_EXECUTIVO_CTO.md`, `ROADMAP.md`, etc. — podem estar desatualizados.
- **`run_legacy_temp.py`:** Script temporário sem propósito documentado.

### Incompleto
- **Cobertura de testes:** `index.tsx` (~3000 linhas, o orquestrador principal) não tem cobertura direta de testes.
- **`beat-to-x-mapping.ts`:** Testes cobrem `interpolateBeatToX` (pura) mas não funções dependentes de OSMD/DOM.
- **UX de loading/error**: Catálogo, sessões e analytics não têm skeleton/error states visuais.
- **Timeout no proxy**: `proxyFetch` não tem `AbortController` com timeout explícito.
- **Cache do catálogo**: Sem persistência em sessionStorage; cada visita ao hub faz nova requisição (~1.5s).
