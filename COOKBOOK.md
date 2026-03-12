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
