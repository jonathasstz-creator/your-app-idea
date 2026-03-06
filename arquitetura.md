Aqui está o ARCHITECTURE.md gerado com base na análise profunda do código fornecido.

code
Markdown

# ARCHITECTURE.md - Piano Trainer System

## 1. Resumo Executivo

O sistema é um **híbrido Web/Desktop** para ensino de piano. O Frontend (`viewer`) é uma SPA (Single Page Application) em React/TypeScript que atua como interface visual de baixa latência. O Backend (`core` + `app`) em Python gerencia o hardware MIDI, a lógica de validação "oficial" e a persistência de dados (Supabase/Local).

**Mudança de Paradigma Recente:** O sistema está migrando de uma renderização puramente "Server-Driven" para **"Client-Driven com Autoridade do Server"**. Isso é crítico para o modo `FILM` (scrolling suave), onde o Frontend calcula o tempo (`LocalTransportDriver`) para garantir 60fps lisos, enquanto o Backend valida o progresso e coleta analytics.

---

## 2. Inventário de Módulos

### 2.1. Viewer (Frontend - `viewer/`)

#### `index.tsx` (Main Entry)
- **Responsabilidade:** Bootstrapping, roteamento manual (Home/Trainer/Dashboard), gerenciamento do WebSocket e injeção de dependências.
- **Estado:** Mantém `practiceMode`, `midiState`, `dashboardState`, `connectionState`.
- **Risco:** Acumula muita lógica de controle ("God component"). Contém a lógica crítica de `dedupe` de input e o loop de renderização do Transport.

#### `lesson-orchestrator.ts`
- **Responsabilidade:** Carregamento atômico e ordenado de lições para evitar *race conditions*.
- **Mecanismo:** Usa um sistema de `tokens`. Se um novo pedido de carga chega, o token anterior é invalidado.
- **Fluxo:** Reset OSMD -> Load XML -> Commit Sheet -> Commit Piano Roll.
- **Risco:** Se o callback de `loadXML` falhar silenciosamente, a lição trava.

#### `osmd-controller.ts`
- **Responsabilidade:** Wrapper sobre a biblioteca `OpenSheetMusicDisplay`. Gerencia o cursor e a "Câmera" (viewport scroll).
- **Features:** Smoothing via física de mola (`springCriticallyDamped`), modo `FILM` (transform CSS baseado em pixels/beat).
- **Debug:** Desenha caixas coloridas se `debug_ui` estiver ativo.

#### `piano-roll-controller.ts`
- **Responsabilidade:** Renderização em Canvas 2D das notas caindo (Synthesia-style).
- **Dependência:** Usa `key-layout.ts` como *Single Source of Truth* para geometria das teclas.
- **Input:** Aceita cliques de mouse para simular piano (Debug).

#### `local-transport-driver.ts` (Novo)
- **Responsabilidade:** Gerador de tempo (clock) do lado do cliente.
- **Lógica:** Usa `performance.now()` e `requestAnimationFrame` para calcular `beatNow` baseado no BPM.
- **Diferença:** Substitui o `transport-client.ts` (que dependia de ticks do server). Permite animações suaves.

#### `lesson-engine.ts` (Client-side Shadow)
- **Responsabilidade:** Lógica de jogo imediata no cliente.
- **Funcionalidade:** Avança o cursor em modo `WAIT`, detecta `HIT`/`MISS` localmente para feedback visual instantâneo (0ms latência percebida).
- **Analytics:** Acumula eventos em um buffer (`flushAnalytics`) para enviar ao backend em lote.

#### `mapping-engine.ts`
- **Responsabilidade:** Resolve a discrepância entre "Notas lógicas da lição" e "Notas visuais do OSMD".
- **Problema:** O OSMD ignora pausas ou agrupa notas de forma diferente do JSON da lição. Este módulo cria um mapa `step_index -> cursor_index`.

#### `analytics-client.ts`
- **Responsabilidade:** Busca dados de `/v1/analytics/overview`.
- **Resiliência:** Possui fallback para JSON estático (`/local-analytics/overview.json`) se a API estiver offline ou sem auth.

---

### 2.2. Backend (Python - `core/`, `app/`)

#### `core/practice_engine.py`
- **Responsabilidade:** A "Verdade" sobre o estado da lição.
- **Lógica:** `process_note_on` valida se a nota tocada é a esperada (Judge).
- **Timing:** Em modo `wait_mode`, mede tempo de reação. Em modo `auto_mode`, mede latência rítmica.

#### `core/service.py`
- **Responsabilidade:** Orquestrador do Backend.
- **Fluxo:** Recebe MIDI do Adapter -> Passa para Engine -> Envia updates para Viewer Manager.
- **Persistência:** Salva sessões locais e chama uploader do Supabase.

#### `managers/viewer_manager.py`
- **Responsabilidade:** Camada de transporte WebSocket.
- **Serialização:** Converte objetos Python em JSON (DTOs) para o contrato `v1` do frontend.

#### `adapters/midi.py`
- **Responsabilidade:** Interface com `mido` e `rtmidi`.
- **Crítico:** Usa `time.monotonic()` para timestamps precisos, evitando jitter de relógio do sistema.

---

## 3. Contratos WebSocket

### 3.1. Server -> Client (Downstream)

| Tipo | Payload Relevante | Produzido em | Efeito no Viewer |
| :--- | :--- | :--- | :--- |
| `lesson_content` | `notes[]`, `score.xml`, `bpm` | `ViewerManager` | Dispara `LessonOrchestrator`. Carrega partitura e piano roll. |
| `midi_input` | `midi`, `velocity`, `is_on` | `Service` (Relay) | Visualiza nota no piano roll. Deduped se for eco local. |
| `midi_status` | `ports[]`, `connected` | `MidiManager` | Atualiza ícone/lista no Header e Popover. |
| `chapter_catalog`| `chapters[]` | `Router` | Renderiza lista de capítulos no Overlay. |
| `start_chapter_ack`| `ok`, `chapter_id` | `Router` | Confirma mudança de rota para `/trainer`. |

### 3.2. Client -> Server (Upstream)

| Tipo | Payload Relevante | Origem no Viewer | Efeito no Backend |
| :--- | :--- | :--- | :--- |
| `midi_connect` | `port` | MIDI Popover | `MidiManager` tenta abrir porta física. |
| `chapter_catalog_request`| `version` | Overlay | Retorna lista de capítulos (do DB ou config). |
| `start_chapter` | `chapter_id`, `mode` | Overlay / Cards | Inicia nova sessão na `PracticeEngine`. |
| `analytics_batch` | `events[]` | `LessonEngine` | Persiste tentativas/erros no banco (Supabase). |
| `set_bpm` | `bpm` | BPM Input | Atualiza `AppConfig` e `TempoMap`. |

**Inconsistências Notadas:**
- `lesson_content`: Backend envia `start_beat` (snake_case) em alguns DTOs e `startBeat` em outros. O frontend (`note-extractor.ts`) possui helpers `toNum` e checagem dupla para mitigar isso.
- `midi_input`: O backend faz "echo" do input. O frontend precisa ignorar esse eco se o input veio do teclado do computador (`lastLocalInput` check).

---

## 4. Fluxos Principais

### A) Inicialização (Boot)
```ascii
[Viewer Init] -> [WS Connect]
      |
      v
[WS Open] -> Envia "chapter_catalog_request"
      |
      v
[Server] -> Responde "chapter_catalog" -> [Viewer] Renderiza Overlay
      |
      v
[Viewer] -> Solicita "midi_status_request" -> [Server] Responde status



B) Carregamento de Lição (MIDIano Pattern)
[User] Clica "Start Chapter 1"
  |
  v
[WS] Envia "start_chapter" -> [Server] Gera Lição -> [WS] Envia "lesson_content"
                                                      (XML + JSON Notas)
  |
  v
[Viewer] Recebe "lesson_content":
  1. LessonOrchestrator gera TOKEN.
  2. Reset OSMD & PianoRoll (limpa memória).
  3. Load XML (OSMD).
  4. Build Mapping (XML vs JSON).
  5. Commit (Exibe UI).
  6. Configura LocalTransport com BPM da lição.

  C) Execução: Modo FILM (Time Film)

  [LocalTransport] -> Loop (rAF) -> Calcula beatNow
       |
       +-> [LessonEngine] tick(beatNow) -> Verifica fim da música (Time Check)
       |
       +-> [PianoRoll] updateByBeat(beatNow) -> Desenha notas descendo
       |
       +-> [OSMD] updateByBeat(beatNow) -> Move cursor suavemente (Scroll)

       Nota: O LessonEngine força o fim (forceEnd) se beatNow > totalDuration + buffer.

D) Execução: Modo WAIT (Wait Input)

[User] Toca MIDI -> [Input Dedupe] -> [PianoRoll] Highlight tecla
       |
       v
[LessonEngine] Verifica nota alvo:
   Se HIT -> Incrementa step -> Move Cursor (OSMD jumpToPos)
   Se MISS -> Registra analytics -> Toca som de erro

   5. Mapa de Pastas e Serviços
Pasta	Conteúdo Principal	Responsabilidade
/viewer	index.tsx, *.ts	Aplicação Cliente. Lógica de apresentação, Audio, Game Loop local.
/viewer/components	osmd-controller, piano-roll	Renderers. Abstraem bibliotecas gráficas (VexFlow/Canvas).
/core	practice_engine.py, service.py	Regras de Negócio. Validação de notas, gestão de sessão.
/adapters	midi.py	Hardware. Camada de isolamento do Mido/RtMidi.
/backend/app	main.py, routers/	API/WS. Pontos de entrada HTTP e WebSocket.
6. Gaps & Plano de Migração (FILM Mode)
Para consolidar o modelo Client-Driven (Visual) + Server-Authority (Dados):

6.1. O que falta (Gaps)
Sincronia de Start: Quando o usuário dá "Play" no FILM, o backend precisa saber o timestamp exato de início (server_started_at) para validar analytics de tempo depois. Atualmente, o frontend apenas "começa a andar".
Seek/Pause: Se o usuário pausar ou pular no frontend, o backend não sabe. Isso afeta o cálculo de "tempo praticado".
Drift: Em sessões longas (>10min), o relógio do JS (performance.now) pode desviar ligeiramente do relógio do Python.
6.2. Estratégia de Migração
Server Seq: O backend deve enviar um server_seq (sequencial) a cada mensagem de estado. O frontend deve ignorar mensagens antigas.
Mensagens de Controle: Criar mensagens WS transport_play, transport_pause, transport_seek enviadas pelo Client ao Server.
Log de Latência: O viewer deve enviar client_timestamp nos eventos de analytics. O backend compara com server_timestamp para monitorar a saúde da conexão.
6.3. Tabela de Dependências (Quem chama quem)
Arquivo / Módulo	Depende de...	Motivo
index.tsx	LocalTransportDriver	Game loop principal.
index.tsx	LessonOrchestrator	Carregar lições sem crash.
LessonEngine	LessonContent	Saber quais notas tocar.
PianoRollController	AudioService	Tocar som (se ativado).
OsmdController	DOM (Container)	Renderizar SVG.
Server (Service.py)	MidiAdapter	Receber input físico.
Server (Analytics)	Supabase	Persistir progresso.