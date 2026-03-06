# Análise do App e Roadmap — Próximos Passos

**Data:** 2026-01-27  
**Contexto:** Piano Trainer / Piano Pro — app de treino musical com falling notes, partitura (OSMD), MIDI, lições e analytics.

---

## 1. Como está o app hoje

### 1.1 O que o app faz

- **Frontend (viewer):** React + Vite + TypeScript. Home → Hub (capítulos) → Sessão de prática.
- **Modos de prática:** WAIT (nota a nota), FILM (Time Film com notas caindo), PLAIN (visual).
- **Input:** Teclado QWERTY mapeado para notas + MIDI físico (Web MIDI).
- **Visualização:** Partitura (OpenSheetMusicDisplay), falling notes, HUD (progresso, score, streak).
- **Backend:** FastAPI em Python — catálogo de lições, sessões, analytics, dashboard.
- **Core:** Engine de prática em Python (`core/`), adaptadores MIDI, storage, sync com viewer.

### 1.2 Arquitetura em resumo

| Camada | Stack | Papel |
|--------|--------|--------|
| **Viewer** | React, Vite, TS | UI, falling notes, OSMD, input, event stream local |
| **Backend** | FastAPI, SQLite/Postgres, Alembic | API REST, lições, sessões, analytics |
| **Core** | Python | `PracticeEngine`, lições, gamificação, sync (viewer_sync) |
| **Adapters** | Python | MIDI (mido/rtmidi) |

- **Dados:** `assets/lessons.json` (módulos/capítulos), `data/` (sessões, etc.), MusicXML para partitura.
- **Fluxo atual:** Cliente pode rodar **local** (LocalTransportDriver, LessonEngine) ou integrar com backend via REST; migração em curso de **WebSocket** para **Event Stream + validação offline (REST)**.

### 1.3 Pontos fortes

- Lições estruturadas (Clave de Sol, etc.) e catálogo bem definido.
- Dashboard de analytics (heatmap, sugestões, etc.) já existe.
- Tipos e contratos em evolução (`LessonContentPacket`, `EventV1`, etc.).
- Testes Python para engine, gamificação, timing, storage.
- Documentação de bugs e plano de correção (QA 2026-01-23) alinhada com arquitetura alvo.

### 1.4 Problemas críticos (QA + plano de correção)

| ID | Problema | Severidade |
|----|----------|------------|
| **A1** | Wait Mode não avança ao tocar (keyboard/MIDI); HUD não aparece | P0 |
| **A2** | Score/streak não atualizam em nenhum modo | P1 |
| **B1** | Partitura termina antes do Falling Notes / progresso (dois clocks) | P0 |
| **C1** | Troca de modo não reseta (step/score herdados) | P0 |
| **C2** | Troca de lição herda progresso da lição anterior | P0 |
| **C3** | Plain Mode sem feedback definido | P2 |
| **D1** | Play não controla execução (parece preview MIDI) | P2 |
| **D2** | Reload não faz nada | P2 |
| **E1** | Falling Notes nascem “em cima” da tecla (sem lead time) | P0 |
| **E2** | Sem count-in visual (2–3 compassos) antes de começar | P0 |

**Causa raiz:** Mistura de **dois contratos** (WS antigo vs cliente-autoritativo + Event Stream). Store/sessão não escopada por `session_id`/`lesson_id`; falta **TimelineController** único; OSMD e falling usam clocks diferentes.

### 1.5 Dívidas técnicas

- **`viewer/index.tsx`** ~2.265 linhas — monolito; difícil manter e testar (Fase 2 do ROADMAP).
- Mapeamento teclado/nota espalhado (`keyboardNoteMap`, etc.); sem tabela única + testes paramétricos.
- Telemetria/observabilidade ainda incipiente (Fase 0 do ROADMAP).
- Polifonia não tratada de forma estruturada (Fase 3).

---

## 2. Prioridades (alinhadas ao ROADMAP e ao plano de correção)

1. **Estabilidade e corretude do runtime** — Eliminar P0/P1; sessão e timeline coerentes.
2. **Manutenibilidade** — Quebrar `index.tsx`, contratos claros, mapeamento único.
3. **Polifonia e áudio** — Engine de vozes, latência, underrun (Fase 3).
4. **Performance e operação** — FPS, CPU, pipeline de release, SLOs (Fase 4).

**Regra:** Estabilidade > corretude de mapeamento > polifonia > performance > novas features. Congelar features até fechar P0/P1 e refatoração crítica.

---

## 3. Roadmap dos próximos passos

### Fase 0 — Baseline e instrumentação (paralelo à Fase 1)

- [ ] Definir e documentar **Event Stream v1** e **StateFrame v1** (já esboçados no plano de correção).
- [ ] Instrumentar **crash**, **drift_ppm** e **latência nota→áudio** onde fizer sentido.
- [ ] Validar schemas (config, lições) na inicialização e em CI.
- [ ] Painel mínimo (local ou backend) para eventos críticos.

**Entregável:** Taxonomia de métricas + eventos nomeados; baseline de estabilidade.

---

### Fase 1 — Estabilidade: P0/P1 e contenção de bugs

Ordem de ataque (com gates), conforme plano de correção:

#### 1.1 Integridade de sessão (C1, C2, D2) — **primeiro**

- [ ] **Reset canônico:** trocar **modo** ou **lição** → `session_end` + novo `session_start`; novo `session_id`; HUD zerado.
- [ ] **Reload** → `RESET_SESSION` + `session_start`; timeline e stores limpos.
- [ ] Garantir que store/contexto não vazam entre lições/modos.
- **Gate:** Smoke de troca de modo + troca de lição + Reload em cada modo.

**Arquivos:** `viewer/index.tsx` (session context, reset, handlers), possivelmente `viewer_sync` / backend se ainda houver uso de WS state.

#### 1.2 Wait Mode + HUD completo (A1, A2)

- [ ] Input (keyboard + MIDI) roteado para runtime em **WAIT**.
- [ ] Avaliar nota → atualizar **StateFrame v1** (step, total, score, streak, last_result).
- [ ] HUD só consome StateFrame (zero cálculo no UI).
- [ ] Telemetria: `note_on` + resultado (HIT/MISS/LATE) com `t_ms`.
- **Gate:** Matriz de modos (Wait + Keyboard, Wait + MIDI) com feedback visível.

**Arquivos:** `LessonEngine`, input adapter no viewer, hooks de gamificação, componentes de HUD.

#### 1.3 Sync único: partitura × falling × progresso (B1)

- [ ] **TimelineController** como único driver de tempo (`timeline_ms`); play avança, pause congela.
- [ ] OSMD, falling e HUD apenas **consomem** `timeline_ms` (sem clock próprio).
- [ ] Event stream como histórico sobre esse clock.
- [ ] Alinhamento partitura / falling / progresso com desvio < 20 ms (P95).
- **Gate:** Teste de desvio automático ou checklist QA.

**Arquivos:** `local-transport-driver`, `osmd-controller`, `piano-roll-controller`, `beat-to-x-mapping`, `mapping-engine`.

#### 1.4 Controles Play e Reload (D1, D2)

- [ ] **Play/Pause** controla TimelineController (execução real); separar “preview MIDI” em ação distinta (ex.: “Ouvir exemplo”).
- [ ] **Reload** já coberto em 1.1; garantir que está ligado ao reset canônico.
- **Gate:** Play pausa/reinicia; Reload reseta tudo; sem “preview” disfarçado de Play.

#### 1.5 UX musical: lead time + count-in (E1, E2)

- [ ] **Lead time:** `lead_time_ms` configurável (ex.: 2000–3000 ms); notas nascem acima e “encaixam” na tecla no tempo certo.
- [ ] **Count-in:** 2–3 compassos de preparação com overlay “3–2–1” e, se possível, click do metrônomo; timeline só inicia após pre-roll.
- **Gate:** Primeira nota cai no tempo certo; usuário vê count-in antes de começar.

#### 1.6 Plain Mode (C3)

- [ ] Decisão explícita: (a) só visual, input desativado + banner, ou (b) treino com HUD. Implementar e documentar.
- **Gate:** Comportamento definido, testado e documentado.

---

### Fase 2 — Refatoração e mapeamento (após P0/P1 estáveis)

- [ ] Quebrar **`index.tsx`** em módulos (ex.: `AppShell`, `Transport`, `Visualization`, `AudioEngine`) — alvo: maior módulo ≤ 400 linhas.
- [ ] **Tabela única** de mapeamento teclado↔nota + testes paramétricos; fallback para mapeamento antigo por flag.
- [ ] Contratos e tipos explícitos (Props, eventos, payloads); verificação em CI.
- **Gate:** Nenhum ciclo de imports; lint ok; smoke da matriz de modos passando.

*(Detalhes em `ROADMAP.md` Fase 2.)*

---

### Fase 3 — Polifonia e qualidade musical

- [ ] Engine de polifonia (voice stealing, limite de vozes, opcional “safe mode”).
- [ ] Testes de integração áudio; métricas de latência e underrun.
- **Gate:** Rollout gradual com flag; sem regressão em cenários atuais.

*(Detalhes em `ROADMAP.md` Fase 3.)*

---

### Fase 4 — Performance e operação

- [ ] Perfilagem e otimizações (render, áudio).
- [ ] Pipeline de release com canário, health-checks e rollback automático.
- [ ] SLOs, runbooks, alertas.

*(Detalhes em `ROADMAP.md` Fase 4.)*

---

## 4. Sequenciamento sugerido (sprints)

| Sprint | Foco | Entregáveis |
|--------|------|-------------|
| **1–2** | Fase 0 + Fase 1.1–1.2 | Instrumentação mínima; reset de sessão (C1, C2, D2); Wait + HUD (A1, A2) |
| **3** | Fase 1.3–1.4 | Timeline único (B1); Play/Reload corretos (D1, D2) |
| **4** | Fase 1.5–1.6 | Lead time + count-in (E1, E2); Plain definido (C3); smoke completo |
| **5–6** | Fase 2 | Quebra do `index.tsx`; mapeamento único; contratos |
| **7+** | Fase 3–4 | Polifonia, performance, pipeline, operação |

---

## 5. Checklist de qualidade (a cada PR de runtime)

- [ ] **Sessão:** Trocar modo ou lição → novo `session_id`, HUD zerado, `session_start` emitido.
- [ ] **Reload:** Reset total; timeline e HUD limpos.
- [ ] **Matriz de modos:** Wait (Keyboard + MIDI), Time Film, Plain — com feedback esperado.
- [ ] **Telemetria:** `session_start`/`session_end`, `note_on` + resultado, `t_ms`.
- [ ] **Smoke manual:** Troca modo/lição, Reload, Play/Pause, count-in, falling.

---

## 6. Onde buscar mais detalhe

- **Bugs e plano de correção:** `bugs/sprint-2026-01-23/` (`relatorio-qa.md`, `plano-correcao.md`).
- **Roadmap técnico (4 fases):** `ROADMAP.md`.
- **Sprint runtime/UI:** `docs/sprints/2026-01-23_runtime-ui.md`.
- **Contratos viewer:** `core/services/contracts/viewer_messages_v1.py`, `viewer/types.ts`.

---

## 7. Resumo executivo

O app está em **transição de arquitetura** (WS → Event Stream + REST) e com **bugs P0** que impedem uso confiável: Wait sem feedback, sync partitura/falling quebrado, vazamento de sessão, controles Play/Reload incorretos, falling sem lead time e sem count-in.

**Próximos passos imediatos:**

1. **Fechar P0/P1** (Fase 1): reset de sessão, Wait + HUD, timeline único, Play/Reload, lead time + count-in, Plain definido.
2. **Instrumentar** (Fase 0) em paralelo para visibilidade e baseline.
3. **Refatorar** `index.tsx` e mapeamento (Fase 2) assim que o runtime estiver estável.
4. Só então **polifonia** (Fase 3) e **performance/operação** (Fase 4), com flags e rollout controlado.

Prioridade: **estabilidade e corretude primeiro**; depois manutenibilidade e novas capacidades.
