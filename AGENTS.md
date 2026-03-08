# AGENTS.md

Guia operacional para agentes de IA e desenvolvedores que vão trabalhar neste repositório com segurança, contexto e consistência.

> **Última atualização:** 2026-03-08 — POST /v1/sessions/{id}/complete fire-and-forget implementado no write path.

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
| Testes | Vitest + jsdom (186+ testes, 18 arquivos) |

> **Nota:** Este projeto Lovable **não tem backend próprio**. Não há FastAPI, não há rotas `/v1` reais. O catálogo de lições funciona 100% offline via `assets/lessons.json`. A arquitetura está preparada para backend futuro (transport layer), mas não depende dele.

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
[assets/lessons.json] → adapter → CatalogService → Trail[] → TrailNavigator/Hub UI
                                                   ↕
[OSMD] → Partitura renderizada → beat-to-x-mapping → Falling Notes / Cursor
                                                   ↕
[Auth] → Lovable Cloud (Supabase) → non-blocking → app continua mesmo sem sessão
```

---

## 2. Arquitetura real do repositório

### Mapeamento de pastas

| Caminho | Responsabilidade |
|---------|-----------------|
| `src/main.tsx` | **Entrypoint real.** Carrega `loadRuntimeConfig()` → valida → importa `src/viewer/index.tsx` |
| `src/viewer/index.tsx` | Orquestrador principal (~2800 linhas). Monta DOM, inicia MIDI, transport, engine, renderiza Home/Hub/Dashboard/Trainer. |
| `src/viewer/catalog-service.ts` | **Serviço central de catálogo.** Lê trails de `lessons.json`, indexa capítulos, resolve `chapterId → lessonId`. Suporta futuro backend via transport. |
| `src/viewer/catalog/types.ts` | Tipos do catálogo: `Trail`, `TrailLevel`, `TrailModule`, `TrailChapter`, `HandAssignment`. |
| `src/viewer/catalog/adapter.ts` | Adapter: converte catálogo local → `Trail[]` hierárquico. |
| `src/viewer/catalog/local-catalog.ts` | Builder: lê `assets/lessons.json` e monta estrutura normalizada (`tracks[]`, `chapters[]`, `lessons[]`). |
| `src/viewer/components/TrailNavigator.tsx` | Componente completo de navegação: overlay com level tabs, módulos acordeão (framer-motion), cards de capítulo com badges/progresso, card "Recomendado", hand badges. Usa classes CSS de `styles.css`. |
| `src/viewer/lesson-engine.ts` | Motor de lição V1 (monofônico) e V2 (polifônico/acordes). WAIT + FILM modes. |
| `src/viewer/lesson-pipeline.ts` | Parser + roteador automático V1/V2 baseado em heurística. |
| `src/viewer/beat-to-x-mapping.ts` | Mapeia beat musical → posição X na tela (critical para falling notes + cursor). |
| `src/viewer/analytics-client.ts` | Cliente de analytics: `fetchOverview()`, cache por user, fallback estático. |
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
| `src/viewer/__tests__/` | 18 arquivos de teste Vitest cobrindo regressões críticas. |
| `public/config.json` | Config de runtime (Supabase URL, analytics mode). |
| `assets/` | **Fonte de verdade do currículo:** `lessons.json` (trilhas/capítulos estáticos). |
| `viewer/` (raiz) | **LEGADO.** Não usar. `src/viewer/` é o canonical. |

### Pipeline do catálogo local (sem backend)
```
assets/lessons.json
  → buildLocalCatalog()          # src/viewer/catalog/local-catalog.ts
    → { tracks[], chapters[], lessons[] }
  → adaptCatalogToTrails()       # src/viewer/catalog/adapter.ts
    → Trail[] (levels/modules/chapters hierárquico)
  → CatalogService.getTrails()   # src/viewer/catalog-service.ts (fallback local)
  → TrailNavigator / LessonsHubPage / piano-pro-hub
```

### Entrypoints
1. **Web (Lovable/Vite):** `index.html` → `src/main.tsx` → `src/viewer/index.tsx`

### Dependências críticas entre camadas
- `lesson-engine.ts` **não depende** de DOM/React — é testável isoladamente.
- `beat-to-x-mapping.ts` **depende** de `OsmdController` (DOM) — difícil de testar unitariamente sem mock.
- `analytics-client.ts` depende de `auth-storage.ts` → `getAuthTokenFromStorage()`.
- `catalog-service.ts` funciona **100% offline** via `lessons.json`. Backend é opcional.
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
npx vitest run                                    # Suíte inteira (186+ testes)
npx vitest run src/viewer/__tests__/              # Apenas testes do viewer
npx vitest run src/viewer/__tests__/polyphony     # Arquivo específico
npx vitest --watch                                # Watch mode
```

### Cobertura de testes atual (18 arquivos)
| Arquivo | Cobertura |
|---------|-----------|
| `auth-storage.test.ts` | Token extraction, sync, clear, nested structures |
| `auth-storage-senior.test.ts` | Custom domain fallback, atomicidade do sync |
| `analytics-client.test.ts` | buildHeaders real, fetchOverview, cache, fallback |
| `badge-independence.test.ts` | MIDI vs Backend badges independentes |
| `beat-to-x-mapping-fallbacks.test.ts` | Monotonicidade, fallback triggers |
| `catalog-service.test.ts` | Cache, dedup, chapter→lesson mapping, indexação estática, fallback local |
| `complete-payload-invariants.test.ts` | local_date São Paulo, fire-once guard |
| `feature-flags-layers.test.ts` | Precedência de 4 camadas, JSON corrompido |
| `fire-and-forget-complete.test.ts` | POST /complete resiliente a falhas |
| `hand-split-rule.test.ts` | C4 (60) = mão direita |
| `lesson-engine-invariants.test.ts` | Score, streak, AttemptLog, forceEnd |
| `lesson-engine-timer-integration.test.ts` | Integração engine + timer |
| `lesson-session-controller.test.ts` | Controlador de sessão |
| `lesson-timer.test.ts` | Timer unitário |
| `lesson-timer-regression.test.ts` | Timer básico com fake timers |
| `polyphony-chords.test.ts` | Chord expansion, PARTIAL_HIT, miss window |
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

### 6.2 Carregamento de catálogo (local-first)
```
init() / useLessons()
  → buildLocalCatalog()         # Lê assets/lessons.json
  → adaptCatalogToTrails()      # Converte para Trail[]
  → Renderiza TrailNavigator / LessonsHubPage

  // Opcionalmente, se transport estiver disponível:
  → catalogService.load(transport)  # Enriquece com dados do backend
  → buildTrailsFromCatalog()        # Mescla tracks[] + chapters[]
```

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
  → computeTaskResult(attempts, totalSteps, mode)
  → dispatchTaskCompletion(result)
  → POST /v1/sessions/{session_id}/complete (fire-and-forget, inline em index.tsx)
    → Headers: Authorization: Bearer <token>, Idempotency-Key: crypto.randomUUID()
    → Payload: { completed_at, duration_ms, summary: { pitch_accuracy, timing_accuracy, avg_latency_ms, std_latency_ms, hits, misses }, attempts_compact }
    → Guard: `completeSent` flag impede envio duplicado na mesma sessão
    → Guard: sem session_id ou sem token → skip com log
    → Falha de rede: log "[Complete] failed", NÃO bloqueia Endscreen
  → showEndscreen(result) — SEMPRE executa, independente do POST
```

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
| **Currículo / lições** | `assets/lessons.json` **(fonte primária)** |
| Tipos do catálogo | `src/viewer/catalog/types.ts` |
| Tipos do domínio musical | `src/viewer/types.ts` |
| Tipos do task/endscreen | `src/viewer/types/task.ts` |
| Tipos de analytics | `src/viewer/analytics-client.ts` (interfaces inline) |
| Tipos de auth | `src/viewer/auth/types.ts` |
| Serviço de catálogo | `src/viewer/catalog-service.ts` |
| Adapter local | `src/viewer/catalog/adapter.ts` + `local-catalog.ts` |
| Config de runtime | `src/config/app-config.ts` (AppConfig interface) |
| Config publicada | `public/config.json` |
| Feature flags | `src/viewer/feature-flags/types.ts` (FeatureFlags) |
| Engine de lição (lógica central) | `src/viewer/lesson-engine.ts` |
| Mapeamento beat→X | `src/viewer/beat-to-x-mapping.ts` |
| Transposição | `src/viewer/services/lesson-transposer.ts` |
| Auth storage | `src/viewer/auth-storage.ts` |
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
6. **Testes obrigatórios** ao mudar `lesson-engine.ts`, `auth-storage.ts`, `analytics-client.ts`, `beat-to-x-mapping.ts`, `lesson-transposer.ts`, `catalog-service.ts`.
7. **Nunca armazenar secrets em código.** Usar `public/config.json` para chaves públicas (anon key).
8. **Imutabilidade:** `LessonTransposer.transpose()` retorna clone. Engine não muta input. Manter esse padrão.
9. **Fire-and-forget:** POST `/complete` nunca deve bloquear a UI. Falhas são logadas, não lançadas.
10. **Feature flags:** Novas features experimentais devem ser protegidas por flag em `src/viewer/feature-flags/types.ts`.
11. **Sem backend:** Este projeto funciona 100% sem backend. Não criar endpoints fake, não depender de `/v1/*`. O catálogo vem de `assets/lessons.json`.
12. **`viewer/` (raiz) é legado.** Sempre editar `src/viewer/`. Nunca editar `viewer/`.
13. **`assets/lessons.json` é a fonte do currículo.** Não hardcodar currículo em componentes ou serviços. Usar o pipeline: `local-catalog → adapter → Trail[]`.

### Processo de correção de bugs
1. **Diagnosticar:** Ler logs, checar storage, validar env vars e feature flags.
2. **Isolar:** Reproduzir com teste unitário.
3. **Planejar:** Identificar ponto de entrada e consumidores afetados.
4. **Implementar:** Fix mínimo + teste.
5. **Validar:** `npx vitest run` (todos os testes devem passar).

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

### Beat-to-X mapping
- Se a taxa de match entre notas OSMD e steps for < 80%, fallbacks são acionados automaticamente.
- A monotonicidade (x nunca diminui com beat crescente) é crítica. Se quebrar, falling notes "voltam" na tela.
- Line breaks (sistemas diferentes na partitura) são tratados com `LINE_BREAK_THRESHOLD`.

### Catálogo — pipeline local
- `assets/lessons.json` → `buildLocalCatalog()` → `adaptCatalogToTrails()` → `Trail[]`.
- Se `lessons.json` mudar de shape, o adapter precisa ser atualizado.
- `CatalogService.getChapterLessonId()` usa fallback `lesson_{id}` para capítulos ≥ 4 não mapeados.
- O `useLessons()` hook é o ponto de consumo React do pipeline.

### Analytics — timezone
- `local_date` deve ser calculado em `America/Sao_Paulo`, não UTC.
- O cache de analytics é isolado por `sub` do JWT. Se o sub mudar, cache antigo é descartado.

### Feature flags
- Flags atuais: `showSheetMusic`, `showFallingNotes`, `showNewCurriculum`, `useWebSocket`.
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

### Candidato a remoção
- **`viewer/` (raiz):** Pasta legado inteira. `src/viewer/` é canonical.
- **Arquivos `.md` de análise na raiz:** `ANALISE-ARQUIVOS-LEGADOS.md`, `RESUMO_EXECUTIVO_CTO.md`, `ROADMAP.md`, etc. — podem estar desatualizados.
- **`run_legacy_temp.py`:** Script temporário sem propósito documentado.

### Incompleto
- **Cobertura de testes:** `index.tsx` (2800 linhas, o orquestrador principal) não tem cobertura direta de testes.
- **`beat-to-x-mapping.ts`:** Testes cobrem `interpolateBeatToX` (pura) mas não funções dependentes de OSMD/DOM.
- **Navegação completa:** Clicar em capítulo no LessonsHubPage ainda não redireciona para `/practice/:lessonId`.
- **statsIndex do TrailNavigator:** Stub vazio — precisa ser conectado a dados reais de progresso (localStorage ou backend).
