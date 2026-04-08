# COOKBOOK.md

Receitas rápidas para operação e debugging do Piano Trainer. Copy-paste friendly.

---

## Feature Flags

### Ativar flags de Step Quality

```js
window.__flags.set('showStepQualityFeedback', true);
window.__flags.set('useStepQualityStreak', true);
```

### Ver snapshot efetivo

```js
window.__flags.snapshot()
```

### Resetar todas as flags para defaults

```js
localStorage.removeItem('viewer:featureFlags:v1');
location.reload();
```

### Persistir flag via localStorage (sobrevive reload)

```js
const flags = JSON.parse(localStorage.getItem('viewer:featureFlags:v1') || '{}');
flags.showStepQualityFeedback = true;
flags.useStepQualityStreak = true;
localStorage.setItem('viewer:featureFlags:v1', JSON.stringify(flags));
location.reload();
```

---

## HUD / DOM

### Verificar se elementos HUD existem

```js
['hud-quality-badge', 'judge-feedback', 'hud-step'].forEach(id => {
  const el = document.getElementById(id);
  console.log(id, el ? '✅ exists' : '❌ missing');
});
```

### Inspecionar estado do badge

```js
const badge = document.getElementById('hud-quality-badge');
console.log('hidden:', badge?.hidden, 'class:', badge?.className, 'text:', badge?.textContent);
```

---

## Lição V1 vs V2

### Confirmar versão do schema no console

Procure por estes logs ao carregar uma lição:
- `[v2:polyphonic] lesson loaded` → V2
- Ausência → V1

### Capítulos V2 conhecidos

Capítulos 31+ (polifonia, acordes) usam schema V2.

---

## Modo WAIT vs FILM

WAIT: tempo para até o aluno tocar. Step Quality funciona aqui.
FILM: tempo real contínuo. Step Quality **não** se aplica.

---

## Testes

### Rodar suíte completa

```bash
npx vitest run
```

### Rodar apenas testes do viewer

```bash
npx vitest run src/viewer/__tests__/
```

### Rodar teste específico

```bash
npx vitest run src/viewer/__tests__/step-quality-engine.test.ts
```

### Watch mode

```bash
npx vitest --watch
```

---

## Debugging de wiring em index.tsx

### Confirmar que o bloco de feedback está executando

Ao tocar notas em lição V2 WAIT com flags ativas, procure no console:
```
[StepQuality] executing feedback block
```

Se não aparecer, verificar:
1. `currentSchemaVersion` (deve ser 2)
2. `currentMode` (deve ser WAIT)
3. `featureFlagSnapshot.showStepQualityFeedback` (deve ser true)

### Confirmar que subscribe está ativo

Ao mudar flag via console, procure:
```
[StepQuality] flag snapshot updated
```

Se não aparecer, o `featureFlags.subscribe()` foi removido ou não executou.

---

## Step Quality — Receitas completas

### Ativar Step Quality completo (badge + note feedback)

```js
window.__flags.set('showStepQualityFeedback', true);
window.__flags.set('useStepQualityStreak', true);
```

### Ativar apenas note feedback (✓/✗) sem badge

```js
window.__flags.set('showStepQualityFeedback', true);
window.__flags.set('useStepQualityStreak', false);
```

### Verificar se controllers estão instanciados

```js
// Estes elementos devem existir SEMPRE (controllers são criados incondicionalmente)
['hud-quality-badge', 'judge-feedback', 'hud-step'].forEach(id => {
  const el = document.getElementById(id);
  console.log(id, el ? '✅ exists' : '❌ missing (problema de HTML)');
});
```

### Confirmar versão do schema da lição carregada

```js
// No console, ao carregar uma lição:
// V2: "[v2:polyphonic] lesson loaded"
// V1: ausência do log acima
// Badge (Perfeito/Ótimo) → V2-only
// Note feedback (✓/✗) → V1 e V2
```

### Simular cenário V2 WAIT (step quality completo)

1. Ativar flags:
```js
window.__flags.set('showStepQualityFeedback', true);
window.__flags.set('useStepQualityStreak', true);
```
2. Selecionar capítulo 31+ (polifonia/acordes → schema V2)
3. Confirmar modo WAIT (padrão para prática)
4. Tocar notas:
   - Nota correta → ✓ + badge (PERFECT se sem erros)
   - Nota errada → ✗
   - Acorde parcial → ♪ x/y
   - Acorde completo → ✓ + pulse + badge

### Confirmar path de execução do feedback

Ao tocar notas com flags ativas, verificar no console:
```
[StepQuality:feedback] schema=2 hit=true chordSize=3
```

Se não aparecer:
1. `showStepQualityFeedback` está `false` → ative a flag
2. Modo é FILM → mude para WAIT
3. Engine é `null` → lição não carregou
4. `isEnded()` → lição já terminou

### Verificar streak numérico (x3, x5...)

```js
// Flag que controla visibilidade do streak counter
window.__flags.snapshot().showStreakCounter
// Para esconder: window.__flags.set('showStreakCounter', false)
// Para mostrar:  window.__flags.set('showStreakCounter', true)
```

### Diagnóstico rápido — por que o feedback não aparece?

```js
// Execute tudo de uma vez:
const snap = window.__flags.snapshot();
console.table({
  'showStepQualityFeedback': snap.showStepQualityFeedback,
  'useStepQualityStreak': snap.useStepQualityStreak,
  'showStreakCounter': snap.showStreakCounter,
  'badge DOM': !!document.getElementById('hud-quality-badge'),
  'feedback DOM': !!document.getElementById('judge-feedback'),
  'step DOM': !!document.getElementById('hud-step'),
});
```
