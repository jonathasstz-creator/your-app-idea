# Roadmap técnico (4 fases) — foco em estabilidade, mapeamento e polifonia

> **Ver também:** [ROADMAP-PROXIMOS-PASSOS.md](./ROADMAP-PROXIMOS-PASSOS.md) — análise do app hoje + sequência prática de próximos passos (P0/P1, sprints, checklist).

## Fase 0 (pré-trabalho) — Alinhamento e baseline
- Entregáveis
  - Matriz de prioridades (estabilidade > corretude de mapeamento > polifonia > performance > novas features).
  - Taxonomia de métricas definida e instrumentada (dashboards mínimos).
- Métricas-alvo
  - Crash-free sessions ≥ 99%.
  - Tempo médio de recuperação de erro (MTTR) < 30 min.
  - Cobertura de telemetria: ≥ 95% dos fluxos críticos com eventos.
- Riscos & mitigação
  - Falta de visibilidade: instrumentar via feature flag que possa ser desligada se gerar overhead.
  - Dados ruidosos: validar eventos em ambiente de canário antes de geral.
- Definição de pronto (DoD)
  - Painel acessível e confiável.
  - Eventos nomeados e documentados.
  - Alertas configurados e testados com incidentes simulados.

## Fase 1 — Contenção de bugs e drift (Estabilidade primeiro)
- Entregáveis
  - Hotfix dos bugs críticos conhecidos.
  - Guardrails de schema/config para evitar drift (validação na inicialização e CI).
  - Playbook de rollback (scripts + runbook).
- Métricas-alvo
  - Crash-free sessions: ≥ 99.5%.
  - Drift_ppm (configs divergentes por milhão de execuções): < 50 ppm.
  - Tempo de rollback automatizado: < 5 min (P95).
- Riscos & mitigação
  - Regressão em hotfix: envolver feature flags de escopo fino e rollout gradual (1% → 10% → 50% → 100%).
  - Falhas de validação em produção: modo “warn” primeiro, “fail” depois de 1 sprint.
- DoD por entregável
  - Hotfix: teste unitário + e2e cobrindo o bug; flag de rollout; monitoramento de erro configurado.
  - Guardrails: testes de contrato em CI; falha visível; documentação de campos obrigatórios.
  - Playbook: executado em ambiente de ensaio; tempos registrados; reversão restaurando estado anterior.

## Fase 2 — Refatoração do `index.tsx` e mapeamento (manutenibilidade + corretude)
- Entregáveis
  - Quebra de `index.tsx` em módulos coesos (p. ex., `AppShell`, `Transport`, `Visualization`, `AudioEngine`).
  - Mapa de teclado/nota refeito com tabela única de verdade + testes de mapeamento.
  - Tipos e contratos explícitos para APIs internas (Props, eventos, payloads).
- Métricas-alvo
  - Tamanho do maior módulo: ≤ 400 linhas.
  - Cobertura de testes no novo mapeamento: ≥ 90%.
  - False_miss_rate (notas não reconhecidas quando deveriam): < 1%.
  - Tempo médio para adicionar um novo mapeamento: < 30 min (medido em doc de dev).
- Riscos & mitigação
  - Grande refactor sem segurança: refatoração orientada a testes; feature flag para novo mapeamento; congelar features.
  - Divergência entre layout e áudio: snapshot de tabela de mapeamento validada em CI.
- DoD por entregável
  - Módulos: lint/format ok; imports sem ciclos; docs curtas em `README` local.
  - Mapeamento: testes paramétricos cobrindo todas as teclas; tabela única referenciada; flag para fallback ao mapeamento antigo.
  - Contratos: tipos exportados em um único pacote; verificação de quebra em CI (TS + API extractor/opcional).

## Fase 3 — Polifonia e qualidade musical
- Entregáveis
  - Engine de polifonia com controle de vozes (voice stealing, prioridade) e limites configuráveis.
  - Tests de integração áudio (simulação de acordes, sustain).
  - Monitoramento de latência e jitter do áudio.
- Métricas-alvo
  - Máximo de vozes simultâneas sem clipping: alvo ≥ N (definir após benchmarking de hardware alvo).
  - Latência P95 da nota → áudio: ≤ 20 ms.
  - Percentual de notas cortadas indevidamente: < 0.5%.
- Riscos & mitigação
  - Overload em hardware fraco: auto-ajuste de limite de vozes; preset “safe mode”.
  - Novos artefatos de áudio: canário por subset de usuários; logging de underruns.
- DoD por entregável
  - Engine: testes de stress em CI (mock de tempo); flag para desativar polifonia nova.
  - Integração: cenários de acordes gravados e reproduzidos; comparação de espectro básica.
  - Monitoramento: métricas publicadas; alarmes de underrun configurados.

## Fase 4 — Performance & confiabilidade contínua
- Entregáveis
  - Perfilagem e otimizações (render + áudio thread).
  - Pipeline de release com canário, health-checks e rollback automático.
  - Documentação de operação (SLOs, runbooks).
- Métricas-alvo
  - FPS: ≥ 60 estável em cenário médio; jank < 5% de frames.
  - Uso de CPU em cenário médio: < 60% (thread principal).
  - Crash-free sessions: ≥ 99.7%.
  - MTTR de incidentes: < 15 min.
- Riscos & mitigação
  - Otimizações prematuras: só otimizar gargalos confirmados por perfil.
  - Falhas em release: checagem de saúde automatizada + rollback gateado por erro.
- DoD por entregável
  - Otimizações: perf antes/depois documentado; nenhum teste quebrado; métricas mostram ganho.
  - Pipeline: release canário funcional; rollback testado; checklist publicado.
  - Operação: SLOs aprovados; runbooks versionados; alertas com responsáveis claros.

## Sequenciamento sugerido
1) Fase 0 em paralelo com início da Fase 1 (instrumentação + hotfixes).
2) Congelar features até concluir Fase 2; manter branch de manutenção para hotfix.
3) Liberar polifonia (Fase 3) atrás de flag e rollout gradual.
4) Consolidar performance e operação contínua (Fase 4) com ciclos curtos de medição/ajuste.

## Diferenciais vs. mercado e onde encaixar
- Polifonia configurável e segura (voice stealing determinístico, limite adaptativo): encaixar na Fase 3; flag “safe hardware” para hardware fraco.
- Mapeamento único versionado + testes paramétricos (concorrentes têm múltiplos esquemas sem validação): Fase 2 já cobre; adicionar snapshot validado em CI e fallback por flag.
- Observabilidade e métricas expostas (raras nos concorrentes): iniciar na Fase 0 (taxonomia + painéis) e ampliar na Fase 4 com dashboards de latência, fps, crash-free e drift_ppm.
- Feature flags/rollback de baixo atrito (quase nenhum concorrente): Fase 1 entrega runbook e flags finas; Fase 4 consolida com canário + rollback automático.
- Modos de uso
  - Ensino: labels dinâmicos, pedal, backing track simples — implementar na Fase 2/3 atrás de flag “edu”.
  - Criação rápida: gravação MIDI/áudio lightweight — pós-Fase 3, sempre canarizado.
  - Social/colab: salas com moderação e gravação colaborativa — só após crash-free ≥ 99.7% (pós-Fase 4 inicial).

## Como eu executaria (passos práticos)
- Sprint 1-2: instrumentar crash, drift_ppm e latência nota→áudio; validar schema em CI; hotfix críticos com flags de rollout.
- Sprint 3-4: quebrar `index.tsx` em módulos; criar tabela única de mapeamento + testes paramétricos; habilitar fallback do mapeamento antigo.
- Sprint 5-6: implementar engine de polifonia com voice stealing e limite configurável; métricas de underrun; rollout canário controlado.
- Sprint 7+: perfilagem render/áudio; ativar pipeline de canário + rollback automático; publicar dashboards de SLO. Só então abrir features sociais/edu/recording em flags dedicadas.
