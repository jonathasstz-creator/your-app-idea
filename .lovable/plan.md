

## Diff completo da atualização de scoring V2

Aqui estao os 3 arquivos alterados e 1 espelho legado. Vou apresentar o estado final de cada um — que e o que esta no repo agora.

### Resumo das mudancas

**4 arquivos tocados:**

1. `src/viewer/services/taskCompletion.ts` — Core fix: `computeTaskResult()` agora agrupa attempts por `stepIndex` no V2 para derivar `correctSteps` no nivel de step (nao nota). Adicionou campos `totalExpectedNotes`, `correctNotes`, `noteAccuracy`.

2. `src/viewer/types/task.ts` — Adicionou 3 campos em `TaskResultSummaryV2`: `totalExpectedNotes?`, `correctNotes?`, `noteAccuracy?`.

3. `src/viewer/components/Endscreen/EndscreenV2.tsx` — UI: mudou label de "Respostas Corretas" para "Steps Corretos", de "Acuracia" para "Acuracia (Steps)", e adicionou linha complementar "Acuracia (Notas)" quando `noteAccuracy` existe.

4. `viewer/types/task.ts` — Espelho legado: mesmas 3 propriedades adicionadas em `TaskResultSummaryV2`.

---

### Diff por arquivo

#### 1. `src/viewer/services/taskCompletion.ts`

**ANTES (linhas 44-85 aprox):**
```ts
): TaskResultSummary {
  const correctSteps = attempts.filter((a) => a.success).length;
  const scoreBase = correctSteps * SCORE_PER_CORRECT;
```

**DEPOIS:**
```ts
): TaskResultSummary {
  let correctSteps: number;
  let totalExpectedNotes: number | undefined;
  let correctNotes: number | undefined;

  if (version === "V2") {
    // Group attempts by stepIndex to determine step-level completion
    const stepMap = new Map<number, { successes: number; total: number }>();
    for (const a of attempts) {
      if (!stepMap.has(a.stepIndex)) {
        stepMap.set(a.stepIndex, { successes: 0, total: 0 });
      }
      const entry = stepMap.get(a.stepIndex)!;
      entry.total++;
      if (a.success) entry.successes++;
    }
    // A step counts as correct only if successes > 0 AND no failures
    correctSteps = 0;
    for (const [, entry] of stepMap) {
      const hasFail = entry.total > entry.successes;
      if (entry.successes > 0 && !hasFail) {
        correctSteps++;
      }
    }
    // Note-level metrics
    totalExpectedNotes = attempts.length;
    correctNotes = attempts.filter((a) => a.success).length;
  } else {
    // V1: 1 attempt = 1 step
    correctSteps = attempts.filter((a) => a.success).length;
  }

  const scoreBase = correctSteps * SCORE_PER_CORRECT;
```

**ANTES (bloco V2 return, ~linha 207):**
```ts
  return {
    version: "V2",
    ...
    correctSteps,
    ...
  } as TaskResultSummaryV2;
```

**DEPOIS:**
```ts
  const noteAccuracy = totalExpectedNotes && totalExpectedNotes > 0
    ? correctNotes! / totalExpectedNotes
    : undefined;

  return {
    version: "V2",
    ...
    correctSteps,
    totalExpectedNotes,
    correctNotes,
    noteAccuracy,
    ...
  } as TaskResultSummaryV2;
```

---

#### 2. `src/viewer/types/task.ts` (e `viewer/types/task.ts`)

**ANTES (TaskResultSummaryV2):**
```ts
  totalSteps: number;
  correctSteps: number;

  // Score
  scoreBase: number;
```

**DEPOIS:**
```ts
  totalSteps: number;
  correctSteps: number;

  // Note-level metrics (complementar)
  totalExpectedNotes?: number;       // total de notas individuais nos attempts
  correctNotes?: number;             // notas individuais acertadas
  noteAccuracy?: number;             // correctNotes / totalExpectedNotes (0..1)

  // Score
  scoreBase: number;
```

---

#### 3. `src/viewer/components/Endscreen/EndscreenV2.tsx`

**ANTES (summary section):**
```tsx
<div className="summary-row">
  <span className="label">Respostas Corretas</span>
  <span className="value">
    {result.correctSteps} / {result.totalSteps}
  </span>
</div>
<div className="summary-row">
  <span className="label">Acurácia</span>
  <span className="value percentage">{percentage}%</span>
</div>
```

**DEPOIS:**
```tsx
<div className="summary-row">
  <span className="label">Steps Corretos</span>
  <span className="value">
    {result.correctSteps} / {result.totalSteps}
  </span>
</div>
<div className="summary-row">
  <span className="label">Acurácia (Steps)</span>
  <span className="value percentage">{percentage}%</span>
</div>
{result.noteAccuracy !== undefined && (
  <div className="summary-row">
    <span className="label">Acurácia (Notas)</span>
    <span className="value percentage">{Math.round(result.noteAccuracy * 100)}%</span>
  </div>
)}
```

---

### Semantica da mudanca

| Campo | Antes | Depois |
|-------|-------|--------|
| `correctSteps` (V2) | `attempts.filter(a => a.success).length` (note-level, podia ser 40 para 20 steps) | Agrupado por `stepIndex`, step so conta se TODAS suas notas deram success (max = totalSteps) |
| `totalExpectedNotes` | nao existia | `attempts.length` (40 para 20 steps x 2 notas) |
| `correctNotes` | nao existia | `attempts.filter(a => a.success).length` (note-level) |
| `noteAccuracy` | nao existia | `correctNotes / totalExpectedNotes` (0..1) |
| Endscreen headline | "Respostas Corretas" / "Acuracia" | "Steps Corretos" / "Acuracia (Steps)" + "Acuracia (Notas)" |

