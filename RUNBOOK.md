# RUNBOOK.md

Runbooks de diagnóstico para problemas operacionais conhecidos.

---

## Runbook — HUD Score/Streak/Status instável

### Sintomas
- Score desaparece ao finalizar lição
- Streak some quando o status muda para FINISHED
- Status "pisca" entre HIT/WAITING rapidamente
- Status mostra WAITING depois de já ter mostrado FINISHED

### Diagnóstico

#### 1. Verificar se UIService tem lógica de sticky visibility
```js
// O score deve permanecer visível mesmo se updateHud for chamado sem scoreTotal
// Verificar src/viewer/ui-service.ts — campos scoreShown, streakShown, isTerminal
```

#### 2. Verificar chamadas de updateHud sem scoreTotal
Procurar em `src/viewer/index.tsx` por chamadas `ui.updateHud({ ... status: "FINISHED" })` que omitem `scoreTotal` e `streak`. Essas chamadas **não devem** esconder os valores.

#### 3. Verificar status terminal
```js
// Após FINISHED, qualquer updateHud com outro status (exceto RESET) deve ser ignorado
// Testar no console: observer o HUD-status não mudar após FINISHED
```

### Resolução conhecida (2026-04-08)
- `UIService` implementa sticky visibility + status terminal lock
- Testes: `hud-score-visibility-regression.test.ts`, `hud-status-priority-regression.test.ts`, `hud-streak-combo-regression.test.ts`

---

Runbooks de diagnóstico para problemas operacionais conhecidos.

---

## Runbook — CORS / Proxy / Requisições falhando

### Sintomas
- Catálogo não carrega (lista vazia)
- Console mostra `Failed to fetch` ou `CORS error`
- Network mostra OPTIONS → 400/403
- Requisições não aparecem no DevTools (preflight bloqueado)

### Diagnóstico

#### 1. Verificar se o proxy está ativo
```bash
# No console do browser:
# Verificar se as chamadas vão para o proxy (não direto para api.devoltecomele.com)
# Network tab → filtrar por "api-proxy" ou "functions/v1"
```

#### 2. Verificar Edge Function logs
- Acessar logs da Edge Function `api-proxy` no Lovable Cloud
- Procurar por: `[api-proxy] GET /v1/catalog` — confirma que a requisição chegou
- Se não aparecer: o preflight pode estar falhando antes da função

#### 3. Verificar token
```js
// No console do browser:
// Verificar se há token disponível
localStorage.getItem('sb-tcpbogzrawoiyjjbxiiw-auth-token') !== null
```

#### 4. Verificar resposta do proxy
- Se `401`: token expirado ou inválido → app faz `clearAuthStorage() + reload()`
- Se `502`: proxy não conseguiu alcançar o backend
- Se `200` mas dados vazios: backend retornou `{ chapters: [] }`

### Causas comuns

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| CORS error no preview | Chamada direta ao backend (não via proxy) | Verificar se `proxyFetch` está sendo usado |
| 401 no catalog | Token expirado | Fazer logout e login novamente |
| 502 no proxy | Backend `api.devoltecomele.com` offline | Verificar status do backend |
| Lista vazia sem erro | Backend retornou catalog vazio | Verificar dados no backend |
| Chamada duplicada | `CatalogService` sem dedup | Já tem guard de `loading + loadPromise` |

### Fluxo de rede esperado
```
Browser → OPTIONS /functions/v1/api-proxy/v1/catalog → 200 (CORS preflight)
Browser → GET /functions/v1/api-proxy/v1/catalog → 200 (catalog data)
```

---

Runbooks de diagnóstico para problemas operacionais conhecidos.

---

## Runbook — Step Quality UX/HUD não aparece

### Sintomas

- Ativei `showStepQualityFeedback` e/ou `useStepQualityStreak` mas nenhum feedback visual aparece.
- Nenhum badge (Perfeito/Ótimo/Boa/Recuperou) aparece após completar um step.
- Nenhum feedback de nota (✓, ✗, ♪ x/y) aparece durante a prática.
- Console não mostra logs de Step Quality.

### Causas prováveis (ordem de probabilidade)

1. ~~Lição é V1 — Step Quality só funciona em V2~~ **Atualizado 2026-04-08:** Note feedback (✓/✗) funciona em V1. Quality badge permanece V2-only.
2. Modo é FILM — Step Quality só funciona em WAIT
3. Flag `showStepQualityFeedback` não está ativa
4. Flag `useStepQualityStreak` não está ativa (necessária apenas para quality badge)
5. Elemento DOM (`#hud-quality-badge`, `#judge-feedback`) não existe no HTML
6. Controller não foi instanciado (regressão no boot de index.tsx)
7. `featureFlagSnapshot` não está sendo atualizado (regressão no subscribe)

### Checklist de diagnóstico

#### 1. Verificar flags efetivas
```js
window.__flags.snapshot()
// Esperado: { showStepQualityFeedback: true, useStepQualityStreak: true, ... }
```

#### 2. Verificar elementos DOM
```js
document.getElementById('hud-quality-badge')   // Deve retornar HTMLElement
document.getElementById('judge-feedback')       // Deve retornar HTMLElement
```

#### 3. Verificar versão do schema
- `[v2:polyphonic] lesson loaded` → V2 (badge + note feedback)
- Sem esse log → V1 (apenas note feedback ✓/✗)

#### 4. Verificar modo
O modo deve ser WAIT. FILM usa streak legado.

### Como distinguir o problema

| Resultado | Diagnóstico |
|-----------|-------------|
| Flags estão `false` | Ative manualmente via `window.__flags.set(...)` |
| Flags `true` mas DOM `null` | Problema de HTML/template |
| Flags `true`, DOM existe, sem feedback | Problema de guard (FILM, engine null) |
| V1 sem badge mas com ✓/✗ | **Comportamento correto** — badge é V2-only |

### Validação pós-fix

1. Ativar `showStepQualityFeedback` — sem reload
2. Ativar `useStepQualityStreak` — sem reload
3. Lição V2 WAIT: nota errada → ✗, acorde completo → ✓ + badge
4. Lição V1 WAIT: nota errada → ✗, nota correta → ✓, sem badge
5. Repetir nota já tocada → flash sutil de duplicata

---

## Runbook — Partitura flicka ao trocar feature flags

### Sintomas
- Alternar qualquer flag no painel de debug causa re-render visível da partitura.

### Causa raiz (corrigida 2026-04-08)
O subscriber de `featureFlags.subscribe()` chamava `rebuildSheetMappings()` incondicionalmente quando `showSheetMusic` era `true`, mesmo para flags não relacionadas.

### Resolução
O subscriber compara `prevFlagSnapshot` vs `next` e só reconstrói quando `showSheetMusic` ou `showFallingNotes` mudam.

### Testes
- `flag-toggle-sheet-flicker-regression.test.ts` — 7 testes
