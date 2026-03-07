# AGENTS.md

Guia operacional para agentes de IA e desenvolvedores que vão trabalhar neste repositório com segurança, contexto e consistência.

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
| Auth & DB | Supabase (externo: `tcpbogzrawoiyjjbxiiw.supabase.co`) |
| Backend API | FastAPI/Uvicorn (Python, fora do repo principal — referenciado pelo Makefile) |
| MIDI | Web MIDI API (`webmidi-service.ts`) |
| Sheet Music | OSMD (OpenSheetMusicDisplay) |
| Testes | Vitest + jsdom (145 testes, 15 arquivos) |
| Desktop | Python + pygame/mido (opcional, via `make desktop`) |

### Módulos principais
- **`src/viewer/`** — Núcleo funcional: motores de lição (V1/V2), MIDI, piano roll, OSMD, transport, analytics, auth, endscreen, feature flags.
- **`src/config/`** — Configuração desacoplada de runtime (`app-config.ts`).
- **`src/components/`** + **`src/pages/`** — UI React convencional (dashboard, login, settings). **Não são o entrypoint real.**
- **`viewer/`** (raiz) — Cópia/legado do viewer com build independente (`viewer/vite.config.ts`, `viewer/package.json`). Espelha `src/viewer/`.

### Fluxo de alto nível
```
[Usuário] → MIDI Keyboard → WebMidiService → LessonEngine (V1 ou V2)
                                                   ↕
[Backend API] ← REST/WS Transport ← CatalogService (catálogo de lições)
                                                   ↕
[OSMD] → Partitura renderizada → beat-to-x-mapping → Falling Notes / Cursor
                                                   ↕
[Analytics] → POST /complete (fire-and-forget) + Dashboard stats
                                                   ↕
[Auth] → Supabase Auth → syncSessionToLegacyStorage → buildAuthHeaders
```

---

## 2. Arquitetura real do repositório

### Mapeamento de pastas

| Caminho | Responsabilidade |
|---------|-----------------|
| `src/main.tsx` | **Entrypoint real.** Carrega `loadRuntimeConfig()` → valida → importa `src/viewer/index.tsx` |
| `src/viewer/index.tsx` | Orquestrador principal (~2800 linhas). Monta DOM, inicia MIDI, transport, engine, renderiza Home/Hub/Dashboard/Trainer. |
| `src/viewer/lesson-engine.ts` | Motor de lição V1 (monofônico) e V2 (polifônico/acordes). WAIT + FILM modes. |
| `src/viewer/beat-to-x-mapping.ts` | Mapeia beat musical → posição X na tela (critical para falling notes + cursor). |
| `src/viewer/analytics-client.ts` | Cliente de analytics: `fetchOverview()`, cache por user, fallback estático. |
| `src/viewer/auth-storage.ts` | Extração de token JWT de múltiplas chaves de storage (legado + dinâmico Supabase). |
| `src/viewer/auth/` | Auth gate: login/registro via Supabase, overlay full-screen. |
| `src/viewer/catalog-service.ts` | Catálogo de capítulos/lições com cache, dedup de requests, indexação de trails. |
| `src/viewer/transport/` | Abstração REST/WebSocket (`factory.ts` detecta automaticamente). |
| `src/viewer/services/taskCompletion.ts` | Cálculo de resultado (score, stars, high score, per-note stats). |
| `src/viewer/services/lesson-transposer.ts` | Transposição imutável de lições (clamp MIDI 21-108). |
| `src/viewer/feature-flags/` | Feature flags com 4 camadas: default → localStorage → remote → runtime. |
| `src/viewer/components/Endscreen/` | Tela de resultado pós-lição. |
| `src/viewer/lesson-pipeline.ts` | Parser + roteador automático V1/V2 baseado em heurística. |
| `src/viewer/lesson-timer.ts` | Timer com start/stop/reset, tick a cada 100ms. |
| `src/config/app-config.ts` | Configuração centralizada: `window.__APP_CONFIG__` → `/config.json` → `import.meta.env`. |
| `src/components/` + `src/pages/` | UI React (App.tsx com rotas). **Secundário — o viewer é o coração.** |
| `src/viewer/__tests__/` | 15 arquivos de teste Vitest cobrindo regressões críticas. |
| `public/config.json` | Config de runtime (Supabase URL, API URL, analytics mode). |
| `viewer/` (raiz) | Cópia/legado do viewer. Build separado. Não é o entrypoint do Vite principal. |
| `assets/` | `lessons.json` (trilhas/capítulos estáticos), configs visuais. |

### Entrypoints
1. **Web (Lovable/Vite):** `index.html` → `src/main.tsx` → `src/viewer/index.tsx`
2. **Desktop (Python):** `main.py` → viewer em porta separada
3. **Backend:** `make backend` → `uvicorn app.main:create_app` (porta 8002)

### Dependências críticas entre camadas
- `lesson-engine.ts` **não depende** de DOM/React — é testável isoladamente.
- `beat-to-x-mapping.ts` **depende** de `OsmdController` (DOM) — difícil de testar unitariamente sem mock.
- `analytics-client.ts` depende de `auth-storage.ts` → `getAuthTokenFromStorage()`.
- `catalog-service.ts` depende de `transport` (REST ou WS).
- `index.tsx` é o "god file" que conecta tudo — modificar com extremo cuidado.

---

## 3. Como rodar o projeto

### Pré-requisitos
- Node.js (18+) + npm
- Python 3.8+ (para backend/desktop, opcional)
- Supabase project (externo, já configurado em `public/config.json`)

### Instalação
```bash
npm install          # Frontend
make install         # Python venv + viewer deps (opcional)
```

### Variáveis de ambiente
| Variável | Onde | Propósito |
|----------|------|-----------|
| `VITE_SUPABASE_URL` | `.env` / build | URL do Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` / build | Anon key do Supabase |
| `VITE_API_BASE_URL` | `.env` | URL do backend API |
| `VITE_ANALYTICS_MODE` | `.env` | `api` / `static` / `off` |
| `VITE_USE_WEBSOCKET` | `.env` | `true` para forçar WebSocket |
| `VITE_V2_DYNAMIC_MEASURE_LAYOUT` | `.env` | Layout dinâmico de compassos |
| `DEV_LOCAL_AUTH` | backend | Aceitar `X-Local-UUID` sem token |

**Alternativa sem rebuild:** editar `public/config.json` ou injetar `window.__APP_CONFIG__`.

### Comandos de desenvolvimento
```bash
npm run dev          # Vite dev server (porta 8080)
make backend         # Backend FastAPI (porta 8002)
make desktop         # Desktop runner (porta 8001)
```

---

## 4. Build, testes e validação

### Build
```bash
npm run build        # Produção
npm run preview      # Preview do build
```

### Testes
```bash
npx vitest run                                    # Suíte inteira (145 testes)
npx vitest run src/viewer/__tests__/              # Apenas testes do viewer
npx vitest run src/viewer/__tests__/polyphony     # Arquivo específico
npx vitest --watch                                # Watch mode
```

### Cobertura de testes atual (15 arquivos)
| Arquivo | Cobertura |
|---------|-----------|
| `auth-storage.test.ts` | Token extraction, sync, clear, nested structures |
| `auth-storage-senior.test.ts` | Custom domain fallback, atomicidade do sync |
| `analytics-client.test.ts` | buildHeaders real, fetchOverview, cache, fallback |
| `badge-independence.test.ts` | MIDI vs Backend badges independentes |
| `beat-to-x-mapping-fallbacks.test.ts` | Monotonicidade, fallback triggers |
| `catalog-service.test.ts` | Cache, dedup, chapter→lesson mapping |
| `complete-payload-invariants.test.ts` | local_date São Paulo, fire-once guard |
| `feature-flags-layers.test.ts` | Precedência de 4 camadas, JSON corrompido |
| `fire-and-forget-complete.test.ts` | POST /complete resiliente a falhas |
| `hand-split-rule.test.ts` | C4 (60) = mão direita |
| `lesson-engine-invariants.test.ts` | Score, streak, AttemptLog, forceEnd |
| `lesson-timer-regression.test.ts` | Timer básico com fake timers |
| `polyphony-chords.test.ts` | Chord expansion, PARTIAL_HIT, miss window |
| `timer-regression-end-state.test.ts` | shouldStartTimer guard, timer pós-ended |
| `transposition-pipeline.test.ts` | clampMidi, V1/V2, imutabilidade |

### Validação manual antes de entregar
- [ ] Login → catálogo carrega sem Ctrl+R (cold start)
- [ ] Capítulos de polifonia (31-45) funcionam
- [ ] Endscreen aparece mesmo com falha de rede
- [ ] Dashboard analytics carrega
- [ ] Badges MIDI e Backend independentes

---

## 5. Convenções de desenvolvimento

### Padrões de código
- TypeScript strict (exceto `src/viewer/index.tsx` que usa `@ts-nocheck`)
- Imports com alias `@/` para `src/`
- Nomes de arquivo: kebab-case (`lesson-engine.ts`, `beat-to-x-mapping.ts`)
- Componentes React: PascalCase (`EndscreenV2.tsx`)
- Testes: `__tests__/` com sufixo `.test.ts`

### Organização de responsabilidades
- **Lógica pura** em arquivos dedicados (`lesson-engine.ts`, `lesson-transposer.ts`, `auth-storage.ts`)
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

### 6.1 Autenticação (cold start)
```
src/main.tsx
  → loadRuntimeConfig()     # Carrega /config.json
  → validateConfig()        # Checa supabaseUrl + anonKey
  → import src/viewer/index.tsx
    → ensureAuthenticated() # Verifica sessão Supabase
      → Se sem sessão: monta AuthShell (overlay login/registro)
      → Se com sessão: syncSessionToLegacyStorage()
        → Grava token em 3 chaves legado (localStorage)
    → init()                # Inicializa DOM, MIDI, transport, catalog
```

**Armadilha:** Se `syncSessionToLegacyStorage` não completar antes de `buildAuthHeaders()`, o token não é encontrado e requests falham silenciosamente.

### 6.2 Carregamento de catálogo
```
init()
  → createTransport()       # REST ou WS (auto-detectado)
  → catalogService.load(transport)
    → transport.getCatalog() # GET /v1/catalog
    → buildChapterLessonMap()
    → Cache em memória (dedup de requests concorrentes)
```

### 6.3 Início de sessão de prática
```
Usuário seleciona capítulo no Hub
  → getChapterLessonId()    # Resolve chapter → lesson_id
  → fetchWithAuth('/v1/session')  # POST com buildAuthHeaders()
  → toLessonContentPayload()
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

### 6.5 Analytics
```
AnalyticsClient.fetchOverview(days)
  → buildHeaders() # Requer token via getAuthTokenFromStorage()
  → GET /v1/analytics/overview?days=30
  → Se falha + enableStaticFallback: tenta /local-analytics/overview.json
  → saveCache() (localStorage, isolado por user sub)
```

### 6.6 POST /complete (fire-and-forget)
```
Engine ended
  → computeTaskResult(attempts, totalSteps, mode)
  → dispatchTaskCompletion(result)
  → POST /v1/session/{id}/complete (fire-and-forget)
    → Falha de rede: log no console, NÃO bloqueia Endscreen
```

### 6.7 Feature flags
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
| Tipos do domínio musical | `src/viewer/types.ts` |
| Tipos do task/endscreen | `src/viewer/types/task.ts` |
| Tipos de analytics | `src/viewer/analytics-client.ts` (interfaces inline) |
| Tipos de auth | `src/viewer/auth/types.ts` |
| Tipos de catálogo | `src/viewer/catalog/types.ts` |
| Config de runtime | `src/config/app-config.ts` (AppConfig interface) |
| Config publicada | `public/config.json` |
| Feature flags | `src/viewer/feature-flags/types.ts` (FeatureFlags) |
| Lições/trilhas estáticas | `assets/lessons.json` |
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
6. **Testes obrigatórios** ao mudar `lesson-engine.ts`, `auth-storage.ts`, `analytics-client.ts`, `beat-to-x-mapping.ts`, `lesson-transposer.ts`.
7. **Nunca armazenar secrets em código.** Usar `public/config.json` para chaves públicas (anon key).
8. **Imutabilidade:** `LessonTransposer.transpose()` retorna clone. Engine não muta input. Manter esse padrão.
9. **Fire-and-forget:** POST `/complete` nunca deve bloquear a UI. Falhas são logadas, não lançadas.
10. **Feature flags:** Novas features experimentais devem ser protegidas por flag em `src/viewer/feature-flags/types.ts`.

### Processo de correção de bugs
1. **Diagnosticar:** Ler logs, checar storage, validar env vars e feature flags.
2. **Isolar:** Reproduzir com teste unitário.
3. **Planejar:** Identificar ponto de entrada e consumidores afetados.
4. **Implementar:** Fix mínimo + teste.
5. **Validar:** `npx vitest run` (todos os 145 testes devem passar).

---

## 9. Checklist antes de alterar qualquer coisa

- [ ] Entendi o fluxo completo do código que vou alterar?
- [ ] Identifiquei o ponto de entrada (é em `index.tsx`? Em um módulo isolado?)
- [ ] Li os tipos relevantes (`types.ts`, `types/task.ts`)?
- [ ] Li os serviços que consomem este módulo?
- [ ] Confirmei impacto nos testes existentes?
- [ ] Verifiquei se há feature flag que controla este comportamento?
- [ ] Há risco de quebrar fluxo legado (V1 vs V2, REST vs WS)?
- [ ] Há impacto em analytics, auth, storage ou API?
- [ ] O arquivo `index.tsx` (2800 linhas) será afetado? Se sim, extra cuidado.

---

## 10. Checklist antes de entregar uma alteração

- [ ] `npm run build` compila sem erros?
- [ ] `npx vitest run` — todos os testes passam?
- [ ] Não há imports mortos ou variáveis não usadas?
- [ ] Não há hardcode de URLs, tokens ou credenciais?
- [ ] Não há regressão nos fluxos críticos (auth, catalog, engine, timer)?
- [ ] Se adicionei lógica nova, existe teste cobrindo?
- [ ] Se alterei engine/transposer/analytics, teste de invariante atualizado?
- [ ] Documentação (AGENTS.md, CHANGELOG.md) precisa ser atualizada?

---

## 11. Armadilhas e cuidados do projeto

### Duplicação de código
- **`src/viewer/` vs `viewer/` (raiz):** São cópias quase idênticas. O entrypoint real é `src/viewer/`. A pasta `viewer/` na raiz tem build independente e pode estar desatualizada. **Cuidado ao editar — garanta que é o arquivo correto.**

### index.tsx é um god file
- `src/viewer/index.tsx` tem ~2800 linhas com `@ts-nocheck`. Modificar com extremo cuidado. Preferir extrair lógica para módulos dedicados antes de adicionar funcionalidade aqui.

### Auth storage com múltiplas chaves
- O sistema precisa ler tokens de 5+ chaves diferentes (legado + Supabase dinâmico) em `sessionStorage` e `localStorage`.
- A chave dinâmica (`sb-{ref}-auth-token`) depende de `VITE_SUPABASE_URL` bater com padrão `*.supabase.co`.
- **Custom domains** (ex: `auth.meudominio.com`) fazem a chave dinâmica retornar `null` → cai no fallback legado. Isso é intencional.

### Timer restart bug (P0 histórico)
- Eventos MIDI tardios (depois do engine DONE) podem reiniciar o `LessonTimer` se o guard `shouldStartTimer(isRunning, engineEnded)` não for respeitado.
- O guard está em `index.tsx` linhas 85-87 (dentro de `pushEvent`). Nunca remover essa checagem.

### Polifonia V2 — PARTIAL_HIT
- Em acordes, o step só avança quando **todas** as notas são tocadas.
- Se uma nota errada for tocada durante um chord parcial, é MISS e reseta o `stepState`.
- Duplicatas de nota são ignoradas (não contam 2x).

### Beat-to-X mapping
- Se a taxa de match entre notas OSMD e steps for < 80%, fallbacks são acionados automaticamente.
- A monotonicidade (x nunca diminui com beat crescente) é crítica. Se quebrar, falling notes "voltam" na tela.
- Line breaks (sistemas diferentes na partitura) são tratados com `LINE_BREAK_THRESHOLD`.

### Analytics — timezone
- `local_date` deve ser calculado em `America/Sao_Paulo`, não UTC. Viradas de meia-noite UTC podem gerar data errada no Brasil.
- O cache de analytics é isolado por `sub` do JWT. Se o sub mudar (login com outro user), cache antigo é descartado.

### Config em produção
- Em produção, fallback para `localhost`/`127.0.0.1` é **bloqueado** pelo `app-config.ts`. Requests falharão silenciosamente se `apiBaseUrl` não estiver configurado.

### Fetch de `/config.json` no boot
- É opcional e silencioso. Se falhar, usa `import.meta.env`. Mas se `public/config.json` existir com valores errados, sobrescreve tudo.

### Feature flags pouco visíveis
- Apenas 4 flags atualmente: `showSheetMusic`, `showFallingNotes`, `showNewCurriculum`, `useWebSocket`.
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
| **OSMD** | OpenSheetMusicDisplay — renderizador de partituras MusicXML. |
| **Beat-to-X mapping** | Correspondência entre posição temporal (beat) e posição visual (pixels). |
| **Falling notes** | Visualização piano-roll: notas "caem" no canvas. |
| **AttemptLog** | Array de tentativas do aluno (midi, expected, success, responseMs). |
| **Trail** | Trilha de aprendizado: conjunto de levels → modules → chapters → lessons. |
| **Chapter** | Unidade de progressão. Cada chapter tem um `default_lesson_id`. |
| **HIT/MISS/LATE** | Resultados de avaliação por nota/step. |
| **PARTIAL_HIT** | Estado intermediário: parte do acorde foi tocada corretamente mas não todas as notas. |
| **Fire-and-forget** | Padrão de POST `/complete` que não bloqueia a UI em caso de falha. |
| **Cold start** | Primeiro carregamento do app após login — sequência crítica de sync → catalog. |
| **Endscreen** | Tela de resultado pós-lição (score, stars, high score, per-note stats). |
| **Transport** | Camada de comunicação com backend (REST ou WebSocket). |
| **Feature flag** | Toggle de funcionalidade com 4 camadas de precedência. |
| **Anon key** | Chave pública do Supabase (segura para expor no frontend). |

---

## 13. Pendências e áreas que precisam validação

### Não confirmado
- **Backend:** O código backend (FastAPI) **não está neste repo**. Referências no Makefile e README assumem que existe em `backend/` ou separadamente. Não há como validar endpoints sem acesso ao backend.
- **`viewer/` (raiz) vs `src/viewer/`:** A relação exata entre essas duas pastas não está documentada. Parecem ser cópias, mas podem divergir. **Precisa validação** de qual é canonical.
- **Playwright/E2E:** Não há testes E2E configurados no repo. O README menciona smoke test mas não há script implementado.
- **MSW (Mock Service Worker):** Não está instalado nem configurado. Testes de fetch usam `vi.stubGlobal('fetch', ...)`.
- **`scripts/dev.sh`:** Referenciado no README mas **não existe** no repositório.
- **Uploads de analytics para Supabase:** Mencionado no README (`SUPABASE_ANALYTICS_UPLOAD`) mas não há código frontend correspondente.
- **`run_legacy_temp.py`:** Script temporário na raiz — propósito não documentado.
- **Arquivos `.md` na raiz:** Muitos arquivos de análise/roadmap (`ANALISE-ARQUIVOS-LEGADOS.md`, `RESUMO_EXECUTIVO_CTO.md`, etc.) — podem estar desatualizados.

### Incompleto
- **Cobertura de testes:** `index.tsx` (2800 linhas, o orquestrador principal) não tem cobertura direta de testes.
- **`beat-to-x-mapping.ts`:** Testes cobrem a função `interpolateBeatToX` (pura) mas não as funções que dependem de OSMD/DOM.
- **Linter:** `eslint .` está configurado no `package.json` mas não há `.eslintrc` no repositório. **Precisa validação** se funciona.
- **CI:** Existe `.github/workflows/test-backend.yml` para backend, mas **não há CI para testes frontend**.
