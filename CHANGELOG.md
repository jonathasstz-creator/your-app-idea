# Changelog

## [2026-04-08] - Documentação: Consolidação operacional pós Step Quality fix

### Resumo
Atualização completa da documentação operacional refletindo o estado real do sistema após os fixes de Step Quality UX/HUD (wiring lifecycle, flag toggle anti-flicker, V1 feedback, audio pipeline).

### Documentos atualizados
- **COOKBOOK.md** — Adicionadas receitas de Step Quality: ativação de flags, diagnóstico rápido, simulação V2 WAIT, verificação de controllers, confirmação de path de execução.
- **RUNBOOK.md** — Já atualizado com runbook de Step Quality, CORS/proxy, flag flicker.
- **AGENTS.md** — Já atualizado com Step Quality system, TDD policy, armadilhas de wiring.
- **CLAUDE.md** — Já atualizado com guards, flag snapshot, audio pipeline, Step Quality real behavior.

### Verdades operacionais consolidadas
1. Controllers de UI são instanciados **sempre** no boot (não dependem de flag)
2. `featureFlagSnapshot` é atualizado via `subscribe()` — runtime toggle funciona
3. Note feedback (✓/✗) funciona para V1 e V2; badge é V2-only
4. Step Quality exige modo WAIT; FILM usa streak legado
5. Unit tests **não** detectam bugs de wiring em `index.tsx`
6. Debugging requer verificar: flags → DOM → schema → mode → guards

---

## [2026-04-08] - Step Quality: Feedback V1 + Flag toggle anti-flicker

### Resumo
Dois bugs corrigidos: (1) Step Quality note feedback agora funciona para lições V1 (monofônicas), não apenas V2. (2) Alternar qualquer feature flag no painel de debug não causa mais flicker/rebuild da partitura.

### O que mudou

#### `src/viewer/index.tsx` — Feature flag subscriber (anti-flicker)
- **Antes:** O subscriber de `featureFlags.subscribe()` chamava `rebuildSheetMappings()` toda vez que QUALQUER flag mudava.
- **Depois:** Compara `prevFlagSnapshot` vs `next`, só reconstrói quando `showSheetMusic`/`showFallingNotes` mudam.

#### `src/viewer/index.tsx` — Step Quality feedback V1
- **Antes:** Feedback visual exigia `currentSchemaVersion === 2`. V1 nunca mostrava feedback.
- **Depois:** Note feedback (✓/✗) funciona para V1. Quality badge permanece V2-only.

### Testes adicionados (10 novos, 2 arquivos)
| Arquivo | Cobertura |
|---------|-----------|
| `flag-toggle-sheet-flicker-regression.test.ts` | Flag toggle unrelated não causa rebuild |
| `step-quality-v1-feedback-regression.test.ts` | V1 recebe note feedback, badge é V2-only |

---

## [2026-04-08] - Audio: Síntese piano-like + Pipeline de input unificado

### Resumo
Reescrita completa do `AudioService` com síntese em camadas (triangle + harmônicos) e compressor dinâmico. Pipeline de áudio unificado em `handleNoteInput` — mouse, keyboard e MIDI agora produzem som pelo mesmo ponto. Auto-play de falling notes desligado por padrão.

### O que mudou

#### `src/viewer/audio-service.ts` (reescrito)
- **Síntese em camadas:** triangle (fundamental) + sine (oitava acima, 15%) + sine (3ª harmônica, 5% com decay rápido). Substitui oscilador sine puro que causava chiado.
- **Compressor dinâmico:** `DynamicsCompressorNode` com threshold -24dB, ratio 4:1. Elimina clipping e harshness.
- **Envelope ADSR adaptativo:** decay e release escalam proporcionalmente à duração da nota, evitando artefatos em notas curtas (< 0.3s).
- **Velocity quadrática:** `(vel/127)² × 0.35` para resposta mais natural.
- **Auto-play falling notes:** novo `setAutoPlayFalling(on)` / `getAutoPlayFalling()`, desligado por padrão.

#### `src/viewer/index.tsx` (handleNoteInput)
- **Áudio centralizado:** `handleNoteInput` agora toca/para áudio para TODOS os inputs (mouse, keyboard, MIDI). Antes, só mouse via piano-roll-controller tinha áudio.

#### `src/viewer/piano-roll-controller.ts`
- **Removido áudio duplicado:** `playNote()` e `stopNote()` não chamam mais `audioService` diretamente. Áudio é responsabilidade exclusiva de `handleNoteInput`.
- **Auto-play gated:** falling notes auto-play agora verifica `getAutoPlayFalling()` além de `getEnabled()`.

### Testes adicionados (27 novos, 2 arquivos)
| Arquivo | Cobertura |
|---------|-----------|
| `audio-input-pipeline.test.ts` | Estado do AudioService, autoPlayFalling, convergência de pipeline, gates de enabled/debug |
| `audio-step-quality-convergence.test.ts` | Áudio unificado por source, Step Quality source-independent, anti-double-trigger |

### Impacto
- Som mais rico e limpo (piano-like vs sine buzzy).
- Mouse Piano Input e Keyboard Input agora produzem som.
- Step Quality feedback funciona identicamente para mouse, keyboard e MIDI.
- Notas não tocam sozinhas sem interação do usuário.

---

## [2026-04-08] - HUD UX: Score/Streak Sticky + Status Priority + Step Quality Flag Toggles

### Resumo
Correção de regressões de UX no HUD do Trainer: score e streak não desaparecem mais ao finalizar lição, status não "pisca" após FINISHED, e toggles de Step Quality foram adicionados ao menu de debug.

### O que mudou

#### `src/viewer/ui-service.ts` (refatorado)
- **Score/Streak sticky visibility:** uma vez exibidos, permanecem visíveis mesmo se `updateHud` for chamado sem `scoreTotal`/`streak` (ex: estado `FINISHED`).
- **Status terminal priority:** `FINISHED`/`DONE` bloqueiam sobrescrita por estados transitórios (`HIT`, `WAITING`). Apenas `RESET` desbloqueia.
- **RESET limpa estado interno:** flags de sticky, último valor, e lock terminal são resetados.

#### `index.html`
- Novo grupo "Step Quality" no menu de feature flags com toggles para `useStepQualityStreak` e `showStepQualityFeedback`.

#### `src/viewer/index.tsx`
- Wiring dos novos toggles de Step Quality: leitura do estado inicial das flags + `featureFlags.set()` no `change` handler.

### Testes adicionados (18 novos)
| Arquivo | Cobertura |
|---------|-----------|
| `hud-score-visibility-regression.test.ts` | Score sticky, não desaparece em FINISHED |
| `hud-status-priority-regression.test.ts` | FINISHED terminal, RESET desbloqueia |
| `hud-streak-combo-regression.test.ts` | Streak sticky, reset sem esconder |
| `feature-flags-step-quality-menu-regression.test.ts` | Toggles de Step Quality presentes no menu |

### Impacto
- HUD previsível e estável durante e após sessão de prática.
- Feature flags de Step Quality acessíveis sem console.

---

## [2026-04-06] - Infra: API Proxy genérico + Backend como fonte única do catálogo

### Resumo
Todas as chamadas REST do frontend para o backend (`api.devoltecomele.com`) agora passam por uma Edge Function genérica (`api-proxy`), eliminando problemas de CORS em preview e produção. O catálogo de lições agora usa exclusivamente o backend como fonte de verdade.

### O que mudou

#### Edge Function `api-proxy` (nova)
- **`supabase/functions/api-proxy/index.ts`**: Proxy genérico que aceita qualquer método HTTP e encaminha path + query string para `https://api.devoltecomele.com`.
- Headers encaminhados: `Content-Type`, `Idempotency-Key`, `x-external-auth` (→ `Authorization` no upstream).
- CORS: `Access-Control-Allow-Origin: *`. A antiga `catalog-proxy` foi substituída.

#### Utilitário `proxyFetch` (novo)
- **`src/viewer/proxy-fetch.ts`**: Centraliza todas as chamadas ao backend via proxy.
- Injeta token externo via `x-external-auth` + `apikey` para auth da Edge Function.
- Exporta `proxyFetch()` e `proxyFetchJson<T>()`.

#### Consumidores refatorados
- `catalog-service.ts`, `analytics-client.ts`, `rest-transport.ts`, `index.tsx`, `useLessons.ts`

### Endpoints cobertos
| Método | Path | Fluxo |
|--------|------|-------|
| GET | `/v1/catalog` | Hub de capítulos |
| POST | `/v1/sessions` | Início de sessão |
| GET | `/v1/sessions/{id}/lesson` | Carregamento de lição |
| POST | `/v1/sessions/{id}/complete` | Conclusão fire-and-forget |
| GET | `/v1/analytics/overview?days=N` | Dashboard |
| POST | `/v1/sessions/{id}/events` | Eventos MIDI |

### Latências observadas
| Endpoint | Latência típica |
|----------|----------------|
| GET /v1/catalog | 1.4–1.9s |
| POST /v1/sessions | ~1s |
| GET /v1/sessions/{id}/lesson | ~700ms |
| GET /v1/analytics/overview | 0.5–1s |

---


## [2026-03-12] - Process: TDD and Anti-Regression Architecture

### Mudança
Reestruturação da arquitetura de agentes para incorporar TDD, anti-regressão e quality gates como parte formal do processo.

### O que mudou
- **AGENTS.md**: Nova seção `8.1 TDD and Anti-Regression Policy` com tipos de teste, quality gates, handoff entre agentes.
- **tdd-engineer.md** (novo): Agente dedicado a testes anti-regressão de alto valor.
- **regression-auditor.md** (novo): Agente que valida se testes realmente blindam contra reabertura.
- **test-engineer.md** (atualizado): Diferenciação clara vs tdd-engineer, tabela de módulos atualizada.
- **code-reviewer.md** (atualizado): Agora audita qualidade de testes, pode bloquear por falta de teste.
- **bug-investigator.md** (atualizado): Classificação de tipos de bug, handoff obrigatório para tdd-engineer.
- **orchestrator.md** (atualizado): Delegação TDD explícita na tabela de sinais.
- **conventions.md** (atualizado): Regras de TDD, template para novos agentes de teste, handoff flow.

### Impacto
- Anti-regressão virou parte formal do processo, não pós-pensamento.
- Quality gates documentados: bug fix sem teste precisa de justificativa.
- Fluxo de handoff entre agentes definido: investigar → implementar → testar → auditar → revisar.

---

## [2026-03-12] - Fix: Step Quality UX/HUD não aparece com flags ativadas

### Bug
Feedback visual do Step Quality (badge PERFECT/GREAT/GOOD/RECOVERED, note feedback ✓/✗/♪, chord closure pulse) não aparecia mesmo com `showStepQualityFeedback` e `useStepQualityStreak` ativadas via console ou localStorage.

### Causa raiz
Dois problemas de wiring/lifecycle em `src/viewer/index.tsx`:

1. **Controllers condicionais:** `StepQualityBadgeController`, `NoteFeedbackController` e `ChordClosureEffect` eram instanciados apenas se as flags estivessem `true` no momento do boot. Se ativadas depois (runtime ou localStorage + reload), os controllers permaneciam `null`.

2. **Snapshot congelado:** `featureFlagSnapshot` era capturado uma vez durante `init()` e nunca atualizado. Chamadas a `window.__flags.set()` alteravam o store mas o handler MIDI continuava lendo o snapshot antigo.

### Patch
- Controllers de Step Quality agora são instanciados **sempre** no boot, independente das flags. Eles toleram elementos DOM ausentes (guard `if (!this.el) return`).
- Adicionado `featureFlags.subscribe(next => { featureFlagSnapshot = next })` para manter o snapshot sincronizado com mudanças de flag em runtime.
- Adicionados logs diagnósticos mínimos (`console.info` no boot, `console.debug` no handler).

### Impacto
- Feedback visual de Step Quality agora funciona corretamente em lições V2 WAIT com flags ativas.
- `window.__flags.set()` agora reflete imediatamente no comportamento do handler MIDI.
- Nenhuma mudança em engine, scoring, stars, high score, backend ou schema.
- V1 e FILM mode continuam fora do escopo por design.
- Comportamento legado (flags off) preservado integralmente.

### Risco residual
- `console.debug` no handler MIDI pode poluir console em produção se as flags estiverem ativas. Recomendado mover para guard `import.meta.env.DEV` após validação.
- `featureFlags.subscribe()` não tem `unsubscribe()` chamado — aceitável pois `init()` roda uma vez por vida da página.

### Arquivos modificados
- `src/viewer/index.tsx`

### Documentação atualizada
- `AGENTS.md` — seções de Step Quality, Feature Flags, Armadilhas
- `CLAUDE.md` (novo) — contexto operacional, paths canônicos, guards, Step Quality UX real
- `RUNBOOK.md` (novo) — diagnóstico completo de "HUD não aparece"
- `COOKBOOK.md` (novo) — receitas de console para flags, DOM, debugging
- `CHANGELOG.md`

---

## [2026-03-08] - POST /complete fire-and-forget no write path

### Resumo
Implementado o POST `/v1/sessions/{session_id}/complete` fire-and-forget no callback de fim de sessão (`setupEngineEndCallback` em `index.tsx`). Antes desta correção, o frontend nunca enviava dados de conclusão ao backend — o endscreen aparecia mas nenhuma sessão era persistida, causando dashboard vazio.

### Corrigido
- **Sessões não apareciam no dashboard**: causa raiz era ausência total do POST de conclusão no write path. O fluxo terminava em `dispatchTaskCompletion()` + `showEndscreen()` — ambos locais.

### Adicionado
- **`src/viewer/index.tsx`**: bloco fire-and-forget após `dispatchTaskCompletion()` que:
  - Monta payload: `completed_at` (ISO-8601), `duration_ms`, `summary` (pitch_accuracy, timing_accuracy, avg_latency_ms, std_latency_ms, hits, misses), `attempts_compact`
  - Envia `POST /v1/sessions/{session_id}/complete` com headers `Authorization: Bearer <token>` + `Idempotency-Key: crypto.randomUUID()`
  - Guard `completeSent` impede envio duplicado na mesma sessão
  - Guards de skip: sem `session_id` ou sem auth token → log e skip
  - Erro de rede logado como `[Complete] failed` — endscreen nunca é bloqueado
  - Logs: `[Complete] preparing payload`, `POST sent`, `success`, `failed`, `skipped: missing session id`, `skipped: already sent`
- **`AGENTS.md`**: fluxo 6.5 atualizado com detalhes do POST real, regra 9 e 11 atualizadas, seção "Resolvido" atualizada.

### Arquivos Modificados
- `src/viewer/index.tsx`
- `AGENTS.md`
- `CHANGELOG.md`

---

## [2026-03-08] - Design system CSS + TrailNavigator UI rica

### Resumo
Consolidado o design system visual em `src/viewer/styles.css` com variáveis CSS (neon glassmorphism), estilos responsivos para todas as seções (HUD, sheet, piano roll, dashboard, home, auth, capítulos). Reescrito o `TrailNavigator` de placeholder básico para componente completo com level tabs, módulos acordeão animados (framer-motion), cards de capítulo com badges/progresso, card "Recomendado" e hand badges. Atualizado `AGENTS.md` para refletir estado atual.

### Alterado
- **`src/viewer/styles.css`**: Reescrito completo com design system neon/glassmorphism. Variáveis CSS (`--primary-neon`, `--glass`, `--bg-dark`, etc.), estilos para auth overlay, navbar, HUD layer (z-index 100), sheet section (z-index 10), piano roll, dashboard (KPI grid, heatmap, charts), home page, chapter overlay/cards, responsividade (720px, 600px, 900px breakpoints).
- **`src/viewer/components/TrailNavigator.tsx`**: Reescrito de ~50 linhas placeholder para ~436 linhas com:
  - `ChapterCard`: badges (locked/complete/coming_soon), hand assignment, progress bar, allowed notes count
  - `ModuleAccordion`: seções colapsáveis com framer-motion (AnimatePresence)
  - `RecommendedCard`: destaque "Comece aqui" / "Continue de onde parou"
  - Level tabs: filtragem por `TrailLevel`
  - `HandBadge`: indicador visual de mão (direita/esquerda/ambas/alternada)
  - Keyboard support (Escape para fechar)
  - `StatsIndex` stub preparado para dados reais de progresso
- **`AGENTS.md`**: Atualizado com descrição do TrailNavigator rico, design system consolidado, pendências atualizadas.

### Arquivos Modificados
- `src/viewer/styles.css`
- `src/viewer/components/TrailNavigator.tsx`
- `AGENTS.md`
- `CHANGELOG.md`

---

## [2026-03-04] - Fix P0: Bootstrap pós-login não disparava no cold start + badges de status separados

### Resumo
Corrigido bug crítico (P0) onde o primeiro acesso após login nunca disparava o `GET /catalog` — o app ficava com catálogo "fantasma" (dados estáticos), cliques em capítulos < 100 eram no-op, e o badge de status nunca mudava de "Aguardando conexão…". A causa raiz era uma race condition em `auth/index.ts`: `resolve()` era chamado antes de `syncSessionToLegacyStorage()` terminar, então `buildHeaders()` não encontrava o token e lançava exceção — sem request de rede. Após Ctrl+R o bug desaparecia porque a sessão existente usava o caminho síncrono. Aproveitado também para separar os badges de status "Backend" e "Hardware MIDI" que estavam misturados no mesmo componente.

### Corrigido

#### Bug P0 — Sem request de `catalog` no cold start
- **Causa raiz** (`viewer/auth/index.ts`): `handleAuthenticated` chamava `supabase.auth.getSession().then(syncSessionToLegacyStorage)` como fire-and-forget, mas `resolve()` era chamado **antes** do `.then()` completar. Resultado: `init()` iniciava, `buildHeaders()` chamava `getAuthTokenFromStorage()`, as legacy keys ainda estavam vazias (sync assíncrono não havia rodado), o token não era encontrado, `buildHeaders()` lançava `Error('Auth token missing')`, `catalogService.load()` rejeitava, `disableRestSession()` era chamado — nenhum request de rede.
- **Fix**: transformado `handleAuthenticated` em `async`; agora faz `await supabase.auth.getSession()` e chama `syncSessionToLegacyStorage()` **antes** de chamar `resolve()`. Garante que as legacy keys estão populadas em todos os casos (URL custom domain que não bate o regex `*.supabase.co`, edge cases de timing).

#### Bug — Badge "Hardware MIDI" exibia status do backend REST
- **Causa** (`viewer/index.tsx`): tanto a conexão MIDI (`webMidiService.onStateChange`) quanto o sucesso do carregamento do catálogo REST chamavam `emitConnectionStatus()`. O mesmo estado `connectionState` alimentava o badge com label fixo "Hardware MIDI" — ao conectar REST, aparecia "Conectado (REST API)" sob o label MIDI.
- **Fix**: criado canal separado `homeBackendSignal` / `emitBackendStatus()`. O sucesso do catálogo REST agora emite `emitBackendStatus()` em vez de `emitConnectionStatus()`. `HomeShell` mantém dois estados independentes: `connectionState` (MIDI) e `backendState` (backend).

### Adicionado
- **`viewer/index.tsx`**: `HOME_BACKEND_EVENT`, `homeBackendSignal`, tipo `BackendState`, função `emitBackendStatus()`. `HomeShell` agora expõe `backendConnected` + `backendLabel` para o componente `<Home>`.
- **`viewer/pianopro-home.tsx`**: novo badge "Backend" (ícone `Server`, cor cyan) exibido ao lado do badge "Hardware MIDI". Props `backendConnected?: boolean` e `backendLabel?: string` adicionadas ao `HomeProps`.

### Erros identificados durante a investigação (não causados por este PR)
- `disableRestSession()` era chamado silenciosamente sem log de erro visível ao usuário — dificultava o diagnóstico.
- `getSupabaseStorageKey()` retorna `null` se `VITE_SUPABASE_URL` usar custom domain (não bate `/supabase\.co/i`) — cai apenas nas legacy keys, que dependem do sync síncrono para existir.
- O `requestChapterCatalog()` chamado no boot (linha 2759) renderizava `renderChapterOverlay()` antes do usuário abrir o overlay — estado interno `chapterCatalogStatus = "loading"` era setado precocemente mas sem efeito visual real.

### Arquivos Modificados
- `viewer/auth/index.ts`
- `viewer/index.tsx`
- `viewer/pianopro-home.tsx`

---

## [2026-03-04] - Página de Configurações + Correção de Logout, Clave e Polifonia

### Resumo
Implementada página de Configurações com seções de Perfil, Conta, Segurança, Assinatura e Ajuda. Corrigidos três bugs críticos: logout não fechava a sessão corretamente, capítulos de trilha (100+) renderizavam notas graves em Clave de Sol, e capítulos polifônicos/acordes mostravam a partitura errada (todas as notas no staff de baixo).

### Adicionado
- **`viewer/settings/SettingsPage.tsx`** (novo): página de configurações completa com:
  - **Perfil**: avatar com iniciais, nome exibido, nível de plano
  - **Conta**: e-mail + badge "Verificado", formulário inline de alterar e-mail, formulário inline de alterar senha, botão "Sair"
  - **Segurança, Assinatura, Ajuda**: seções estruturadas com placeholders para expansão futura
  - Framer Motion com stagger animations (containerVariants/sectionVariants), AnimatePresence para formulários inline (height 0→auto)
  - Skeleton loading (3 linhas animate-pulse enquanto `authService.getUser()` resolve)
  - Toast de feedback (ok/err, auto-dismiss 3.5s)
  - Despacha `auth:logout` após `supabase.auth.signOut()`, `profile:updated` após salvar nome
- **`viewer/settings/index.ts`** (novo): re-export de `SettingsPage`
- **`viewer/index.html`**: seção `#settings-page` + botão avatar `#user-menu-btn` com span `#user-initials` na navbar
- **`viewer/index.tsx`**: rota `settings` no dict de páginas, `ensureSettings()` lazy-mount do React root, `refreshInitials()` async, listeners `auth:success` / `profile:updated` / `auth:logout`, `previousRoute` para back navigation
- **`viewer/styles.css`**: animação `pageEnter` 200ms (excluída no `#trainer-page`), estilos `.user-avatar-btn`, `.settings-root`, `.page.settings`, suporte `prefers-reduced-motion`
- **`viewer/auth/authService.ts`**: 4 novos métodos Supabase — `getUser()`, `updateEmail()`, `updatePassword()`, `updateDisplayName()`
- **`viewer/auth/index.ts`**: `window.dispatchEvent(new CustomEvent('auth:success'))` no `handleAuthenticated` para notificar a UI após login

### Corrigido
- **Logout quebrado** (`viewer/index.tsx`): handler `auth:logout` agora chama `clearAuthStorage()` + `window.location.reload()`. Antes apenas chamava `setRoute('home')` — sessão Supabase era destruída mas o overlay de auth nunca reaparecia.
- **Clave errada em capítulos de trilha** (`core/practice_engine.py`): `get_module_id_by_chapter_id()` retorna `None` para capítulos 100+ (não estão em `config.modules`). Antes o fallback era `is_treble = True` sempre — notas G2-D3 de LH trail apareciam em Clave de Sol com muitas linhas suplementares. Agora: `elif module_id is None: is_treble = pitch >= note_name_to_midi_pitch('C4')` — detecção por range de pitch.
- **Partitura errada em capítulos polifônicos** (`backend/app/services/lesson_snapshot.py`): capítulos com `difficulty in ("polyphonic_v2", "chords_v2")` agora usam o exporter V2 para gerar o MusicXML (grand staff, split treble/bass por pitch ≥ C4) mesmo quando `schema_v2_enabled=False`. Os dados de gameplay (`notes`, `schema_version=1`) permanecem inalterados para compatibilidade.

### Arquivos Modificados
- `viewer/settings/SettingsPage.tsx` (novo)
- `viewer/settings/index.ts` (novo)
- `viewer/auth/authService.ts`
- `viewer/auth/index.ts`
- `viewer/index.html`
- `viewer/index.tsx`
- `viewer/styles.css`
- `core/practice_engine.py`
- `backend/app/services/lesson_snapshot.py`

---

## [2026-03-03] - Timer HUD, passo adaptativo em polifonia e tempo médio no dashboard

### Resumo
Timer de sessão restaurado no HUD (nunca havia sido incluído neste branch), contagem de passos adaptativa nas lições polifônicas corrigida, e tempo médio por sessão adicionado aos cards de capítulo e à tabela de sessões recentes no dashboard.

### Adicionado
- **`viewer/lesson-timer.ts`** restaurado: classe `LessonTimer` com `start/stop/reset/getElapsed/isRunning`. Nunca havia sido mergeada para este branch (foi criada em `748ec4e6` no branch `feat/lesson-timing`).
- **HUD timer** (`id="hud-timer"`) adicionado ao `viewer/index.html`. Começa ao primeiro `note_on`, reseta junto com a lição.
- **`UIService.updateTimer(ms)`** adicionado ao `viewer/ui-service.ts` (formato `mm:ss.cs`).
- **Integração do timer em `viewer/index.tsx`**: import, declaração module-scope, instanciação pós-`UIService`, start em `pushEvent` (note_on/note_result), reset em `resetEventStream` e `resetBtn`.
- **Tempo médio por sessão** nos cards de capítulo do dashboard: grid de 2 → 3 colunas com "Tempo Médio" = `practice_time_sec / sessions_total`.
- **Coluna "Duração"** na tabela "Histórico de Sessões" do dashboard: exibe `duration_sec` de cada sessão (dado já existia na API mas não era mostrado).
- **`practice_time_sec`** exposto no schema `StatsChapter` (backend + frontend):
  - `backend/app/schemas/analytics.py` — novo campo `practice_time_sec: float`
  - `backend/app/services/analytics_overview.py` — populado a partir de `progress.practice_time_sec`
  - `viewer/analytics-client.ts` — `practice_time_sec: number` adicionado à interface `StatsChapter`

### Corrigido
- **Passo count adaptativo em lições polifônicas** (`_generate_polyphonic_lesson`): o branch tinha 60 steps fixos com `duration_beats=2.0`. Corrigido para `total_notes ≤ 4 → 20 steps` (ch31) e `total_notes > 4 → 30 steps` (ch32-36), `duration_beats=4.0` em ambos — alinhado com o design original do commit `2cbc0967`.

### Arquivos Modificados
- `viewer/lesson-timer.ts` (novo)
- `viewer/ui-service.ts`
- `viewer/index.html`
- `viewer/index.tsx`
- `core/practice_engine.py`
- `viewer/piano-pro-dashboard.tsx`
- `viewer/analytics-client.ts`
- `backend/app/schemas/analytics.py`
- `backend/app/services/analytics_overview.py`

---

## [2026-03-02] - Restauração do core de lições: V2 Polifonia, Feature Flags e Transpose

### Resumo
Seis bugs introduzidos por commits de features anteriores foram identificados e corrigidos: V2 polifonia não ativava, partitura voltava em branco ao ser religada, transpose havia sido deletado, notas cromáticas apareciam em lições diatônicas, `allowed_notes` dos capítulos 31-45 estavam corrompidos, e acordes (ch 41-45) caíam no path monofônico legado.

### Adicionado
- **Feature flag `showSheetMusic`**: ao desligar, `.sheet-section` recebe `display:none` via classe `is-hidden` e a seção de piano roll expande automaticamente (modo Synthesia).
- **Feature flag `showFallingNotes`**: toggle independente para o canvas de falling notes.
- **Label "Layout" no painel HUD** de feature flags.
- **`_generate_chord_lesson`** restaurado em `core/practice_engine.py` — gera 20 steps com 2 notas aleatórias do pool da mão direita (`hand_roles=["right","right"]`).
- **`viewer/services/lesson-transposer.ts`** restaurado (havia sido deletado pelo commit de endscreen).
- **`osmd-controller.ts`**: método `setTransposition()` e inicialização de `TransposeCalculator` restaurados.
- **Controle de Transpose** restaurado no HUD (`viewer/index.html` + `viewer/index.tsx`).

### Corrigido
- **V2 polifonia não ativava**: adicionado `SCHEMA_V2_ENABLED=true` e `SCHEMA_V2_ALLOWLIST=[4,23,31,32,33,34,35,36,41,42,43,44,45,999]` ao `backend/.env`. O StatReload não observa `.env` — backend precisa de restart manual.
- **Partitura em branco ao religar**: adicionada variável `currentSheetXml` em `index.tsx` para persistir o último XML através de ciclos `destroySheet/ensureSheet`. `rebuildSheetMappings` usa `pendingSheetXml ?? currentSheetXml`.
- **Notas cromáticas em lições diatônicas**: `_generate_polyphonic_lesson` usava `list(range(48,61))` no branch `else`. Corrigido para filtrar `chapter.allowed_notes` com `p < 60` (mão esquerda) e `p >= 60` (mão direita).
- **`allowed_notes` dos ch 31-45 corrompidos** (commit `5083e96c`): restaurados os pools progressivos originais (ch31: `["C3","D3","C4","D4"]`... ch36: escala completa) e pools de mão direita para acordes (ch41: `["C4","E4","G4"]`... ch45: `["C4"-"B4"]`).
- **Difficulty `chords_v2` ausente**: ch 41-45 tinham `polyphonic_v2` indevido. Restaurado `chords_v2` para todos.
- **Dispatch `chords_v2` ausente**: `start_lesson_by_chapter` só tratava `polyphonic_v2`; ch 41-45 caíam no path legado monofônico. Adicionado `elif difficulty == "chords_v2": self._generate_chord_lesson(chapter, seed)`.
- **Boundary C4 duplicada**: split usava `p <= 60` nos dois ranges, colocando C4 na mão esquerda E direita. Corrigido para `p < 60` / `p >= 60`.

### Arquivos Modificados
- `backend/.env`
- `assets/lessons.json` (ch 31-36, 41-45)
- `core/practice_engine.py`
- `viewer/index.tsx`
- `viewer/index.html`
- `viewer/styles.css`
- `viewer/osmd-controller.ts`
- `viewer/services/lesson-transposer.ts` (restaurado)

---

## [2026-03-01] - Corrige capítulos de polifonia e erro 500 em criação de sessão

### Resumo
- Impediu o 500 no POST `/v1/sessions` para o capítulo 31 (Polifonia) ao alinhar definições locais de capítulos com o que o backend espera.

### Detalhes das Mudanças
- **assets/lessons.json**: incluídos os capítulos polifônicos 31–36 e os de acordes 41–45 (todos `difficulty: "polyphonic_v2"`), com notas permitidas C3–C5. Isso permite que `PracticeEngine.start_lesson_by_chapter` encontre os capítulos e gere snapshots normalmente.
- **Banco (ação operacional)**: capítulos 31–36 e 41–45 upsertados na tabela `chapters` com `track_id=hands_together_poly` e ordem definida, garantindo consistência com o catálogo carregado pelo backend (requer restart do backend para carregar o JSON).

## [2026-02-11] - Implementação de Upload e Parsing MIDI (Phase 1)

### Resumo
- **Suporte a Upload MIDI**: Introdução de infraestrutura completa para upload e processamento de arquivos MIDI, convertendo-os automaticamente em lições jogáveis com suporte a polifonia.
- **Backend Robusto**: Novo serviço de parsing baseado em `mido`, router especializado e suporte a armazenamento em disco para arquivos MIDI.
- **Persistência & Dados**: Expansão do modelo de `Lesson` com metadados MIDI e criação de migração de banco de dados (Alembic).
- **Documentação Estratégica**: Adição de análises de mercado, dores do usuário e roadmap para um MVP vendável.
- **Melhorias no Viewer**: Ajustes no motor de lição e componentes de Endscreen para melhor integração com dados dinâmicos.

### Detalhes das Mudanças

#### Backend (MIDI & API)
- **`midi_parser.py`**: Serviço que converte bytes MIDI em `LessonStep`, agrupando notas simultâneas em acordes e calculando metadados (BPM, compasso, duração).
- **`routers/midi.py`**: Endpoints `/upload` (validação e persistência) e `/parse` (preview sem salvar).
- **`models/catalog.py`**: Adicionados campos `source_type`, `midi_file_path`, `midi_file_size` e `midi_meta` à tabela `lessons`.
- **Infraestrutura**: Migração `007_add_midi_fields_to_lessons.py` e configuração de limites de upload em `settings.py`.
- **Testes**: Suíte de testes para validação do parser MIDI e fluxo de upload.

#### Documentação Comercial & Estratégica
- **Análise de Dores**: `01-ANALISE-DORES-MERCADO.md` detalhando os problemas que o MVP resolve.
- **Roadmap MVP Vendável**: Plano de ação em `02-ROADMAP-MVP-VENDAVEL.md` focado em go-to-market.
- **Estratégia Completa**: `ANALISE_ESTRATEGICA_COMPLETA.md` unificando a visão técnica e de negócios.

#### Viewer (Frontend)
- **Engine Update**: Ajustes em `lesson-engine.ts` para melhor suporte a steps polifônicos e metadados de lição.
- **Endscreen V2**: Refinamentos visuais e de lógica em `EndscreenV2.tsx` e `endscreen.css`.
- **Core**: Atualizações de inicialização em `index.tsx`.



## [2026-02-08] - Endscreen V1/V2, Infraestrutura e Documentação

### Resumo
- **Funcionalidade de Endscreen (V1/V2)**: Implementação de arquitetura completa para exibição de resultados pós-tarefa, com suporte a modos monofônico (MVP) e polifônico (acordes).
- **Limpeza do Repositório**: Remoção de arquivos legados, planos obsoletos e documentação redundante.
- **Estruturação de Infraestrutura**: Introdução de `Makefile` para comandos padronizados e GitHub Actions para CI/CD (testes de backend).
- **Documentação Estratégica V2**: Adição de análises arquiteturais profundas, roadmaps e ADRs para o desenvolvimento do Layout Dinâmico e suporte polifônico.
- **Padronização de Ambiente**: Refatoração do `.gitignore` e simplificação do `README.md` para onboarding mais rápido.

### Detalhes das Mudanças

#### Endscreen (V1 & V2)
- **Arquitetura & Tipagem**: Criação de `01-types.task.ts` definindo `AttemptLog` e `TaskResultSummary` para versões V1 (monofônico) e V2 (polifônico/acordes).
- **Lógica de Conclusão**: Módulo `taskCompletion.ts` para cálculo de scores, estrelas (0-5) baseado em acurácia e persistência de high scores via `localStorage`.
- **Frontend Components**:
  - `EndscreenV1.tsx`: MVP monofônico com foco em acurácia e estatísticas por nota.
  - `EndscreenV2.tsx`: Interface polifônica avançada com tabs expandíveis (Resumo, Acordes, Notas), bônus de tempo e threshold visual de 3 estrelas.
  - `useTaskResult.ts`: Hook para gerenciamento de listeners de conclusão e bloqueio de inputs durante a exibição do overlay.
- **Estilo & UI/UX**: Design unificado em `endscreen.css` utilizando estética glassmorphism e neon (DNA do Analytics).

#### Limpeza & Organização
- **Pruning**: Deletados `.cursor/plans/`, `.viewer_port` e arquivos de correção temporários.
- **Novas Análises**: Criado `ANALISE-ARQUIVOS-LEGADOS.md` e scripts de análise de arquivos não utilizados.
- **`.gitignore`**: Expansão para incluir diretórios de IDEs, logs e artefatos de build.

#### Infraestrutura (DevOps)
- **`Makefile`**: Centralização de comandos (`install`, `backend`, `desktop`, `seed-catalog`).
- **GitHub Actions**: Implementação de `test-backend.yml` para validação automatizada em branches principais e PRs.

#### Documentação Arquitetural
- **V2 Dynamic Layout**: Criação de `analise_v2_dynamic_layout.md`, `INTEGRACAO_BEAT_TO_X_MAPPING.md` e `ARQUITETURA_VISUAL.md`.
- **Estratégia & Roadmap**: Adição de `ROADMAP.md`, `ROADMAP-PROXIMOS-PASSOS.md`, `RESUMO_EXECUTIVO_CTO.md` e `ANALISE_SENIOR_PLANO_ALTERNATIVO.md`.
- **Governança**: Registro da primeira ADR (`ADR_001_V2_DYNAMIC_LAYOUT.md`).
- **Código Pronto**: Módulo `measure-density.ts` e testes unitários correspondentes integrados como base para o layout dinâmico.

#### UI/UX & Docs
- **`README.md`**: Simplificado para focar no setup local via `make`.
- **Guias**: Adicionado `README_ANALISE_COMPLETA.md` e índices de navegação para a nova documentação.


## [2026-02-07] - Lição Polifônica V2 (Piano Trainer)

### Resumo
- Adicionados os **Chapters 23** ("Maos Juntas: Escala de Do Maior") e **99** com `difficulty="polyphonic_v2"`.
- Extensão do modelo e motor para suporte a **acordes** e julgamento com **PARTIAL_HIT**.
- Melhoria na robustez do mapeamento visual (Viewer) com fallbacks para cursor scan e layout dinâmico.
- Ajuste no Engine V2 (Client) para suportar durações variáveis de steps (notas longas).
- **Refatoração do Sistema de Áudio**: Novo toggle de áudio com estados visuais (On/Off) e sincronização de ícones.
- **Melhorias no Metrônomo**: Suporte a auto-resume do `AudioContext` e limpeza de estado (`lastSnapshot`) em resets.
- **Melhorias de UX/UI**: Feedback visual de conectividade MIDI, visibilidade contextual de controles (BPM/Metrônomo) e consolidação do fluxo de Reset.

### Detalhes das Mudanças

#### API & Modelos
- **`models.py`**: Adicionado campo `difficulty: Optional[str]` em `Chapter`.
- **`entities.py`**: 
  - Adicionado `PARTIAL_HIT` em `StepStatus`.
  - Novos campos em `LessonStep`: `expected_chord: Optional[List[int]]` e `hand_roles: Optional[List[str]]`.
  - Atualizado `LessonStep.from_kwargs` para suporte a esses campos.
- **`v2_builder.py`**: Ordenação de `steps[].notes` e inclusão de metadados extras para acordes.

#### Implementação do Motor de Prática (`practice_engine.py`)
- O gerador polifônico `_generate_polyphonic_lesson` agora é condicional por `chapter_id`:
  - **Chapter 23**: Lição "mãos juntas" em Dó Maior (naturais C3–C5), 30 steps, 4 beats por step.
  - **Chapter 99 (Fallback)**: Cromático (C3–C5), 60 steps, 2 beats por step.
- **Mecanismo de Julgamento Polifônico**:
  - Novo estado `self._chord_hits: Set[int]` para rastrear notas de um acorde.
  - Lógica de `process_note_on` atualizada: notas parciais retornam `PARTIAL_HIT`, avançando apenas ao completar o acorde.
  - Reset de clock e estado via helper `_advance_step`.
- Ajuste em `TrainingSession.total_steps` para refletir a contagem real de steps gerados.

#### Viewer & Client Engine (Frontend)
- **`index.html`**: 
  - Substituído o botão de Play/Pause de áudio por um botão de Ativar/Desativar som com novos ícones SVG.
  - Removido botão de **Reload** redundante e atualizado ícone/tooltip do botão de **Reset**.
  - Adicionada gestão de visibilidade contextual para controles de BPM e Metrônomo.
- **`index.tsx`**:
  - Implementado `updateAudioButtonState` para sincronizar o estado visual do botão com o `audioService`.
  - Adicionado delay (`requestAnimationFrame`) na inicialização para garantir renderização do OSMD antes do cálculo de mapa.
  - Integração com flag `V2_DYNAMIC_MEASURE_LAYOUT`.
  - **Visibilidade de Controles**: BPM e Metrônomo agora são exibidos apenas no modo **FILM**.
  - **Status MIDI**: Botão MIDI agora reflete estado de conexão visualmente e via tooltip (porta ativa).
  - **Reset Refinado**: O botão de reinício agora gera um novo `session_id` mantendo o modo atual, garantindo limpeza total do estado.
- **`styles.css`**: 
  - Adicionados estilos para a classe `.active` em botões de ícone, com feedback visual em neon (glow e borda).
  - Estilo específico para MIDI ativo (verde) para feedback imediato de conexão.
- **`transport-metronome.ts`**:
  - `setEnabled` agora é assíncrono e gerencia o `AudioContext` (resume) para contornar políticas de autoplay.
  - Adicionada limpeza de `this.lastSnapshot` ao parar o metrônomo para evitar estados inconsistentes após reset.
- **`beat-to-x-mapping.ts`**:
  - Implementado sistema de fallbacks para mapeamento V2:
    1. Scan por conteúdo (match de notas);
    2. Scan do cursor OSMD (`buildBeatToXMappingV2ByTime`) para posições reais;
    3. Layout Dinâmico (calculado matematicamente via `beatsPerMeasure`).
  - Adicionada verificação de confiabilidade (`MIN_MATCH_RATIO`) para ativar fallbacks automaticamente.
- **`lesson-engine.ts`**:
  - Atualizado cálculo de `missAfterMs` para considerar `step.duration_beats`, permitindo janelas de tempo corretas para notas longas/acordes.

#### Configurações & Dados
- **`lessons.json`**:
  - Adicionado módulo `hands_together` (Chapter 23).
  - Adicionado módulo `hands_together_poly` (Chapter 99).
- **`settings.py`**: `schema_v2_allowlist` atualizada para inclui `[4, 23, 999]`.
- **`seed_catalog.py`**: Adicionado tratamento especial para Chapter 23 (canonical placeholder) e Chapter 4.

#### Testes
- **`test_v1_invariants.py`**: Atualizado meta-teste para garantir que capítulos polifônicos (como o 23) fiquem fora do V1.
- **`test_polyphonic_engine.py`**: Adicionado `test_polyphonic_c_major_random_steps` para validar a geração do Chapter 23 (30 steps, acordes de 2 notas).
- **Unitários (Engine)**: Validação da integridade dos acordes e transição `PARTIAL_HIT` -> `HIT`.
- **Manuais**: Teste em modo **FILM** garantindo que o avanço ocorre apenas com o acorde completo.
