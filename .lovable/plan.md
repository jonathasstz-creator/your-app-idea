

## Plan: Senior-level scoring contract fix (V2 accuracy)

### Diagnosis of current patch weaknesses

1. **`totalExpectedNotes = attempts.length`** — Wrong. Attempts include retries/misses. For 20 steps × 2 notes, expected is always 40, but attempts can be 60+ with retries.

2. **`correctNotes = attempts.filter(success).length`** — Can inflate with duplicate successes across retries of the same step.

3. **`correctSteps` = "all attempts for stepIndex have success"** — Too strict. In V2 WAIT mode, a MISS resets `stepState` and the student retries. The step IS eventually completed (engine advances `currentStep`), but earlier failed attempts remain in the log, causing `hasFail = true` and incorrectly zeroing the step.

### Root cause: the engine already knows the answers

Looking at `LessonEngineV2`:
- **`this.score`** increments exactly once per completed step (line 849). This IS `completedSteps`.
- **`this.steps`** contains the lesson structure with `notes[]` arrays. `sum(step.notes.length)` IS `totalExpectedNotes`.
- For completed steps, ALL notes were hit by definition (engine only advances when `chordNotes.every(m => stepState.has(m))`).

### Changes (4 files)

**1. `src/viewer/lesson-engine.ts`** — Expose engine truth via `LessonEngineApi`

Add two methods to the interface and both implementations:

```ts
// Add to LessonEngineApi interface:
getCompletedSteps(): number;
getTotalExpectedNotes(): number;

// V1 implementation:
getCompletedSteps() { return this.score; }
getTotalExpectedNotes() { return this.notes.length; }

// V2 implementation:
getCompletedSteps() { return this.score; }
getTotalExpectedNotes() { 
  return this.steps.reduce((sum, s) => sum + (s.notes?.length ?? 0), 0); 
}
```

**2. `src/viewer/services/taskCompletion.ts`** — Use engine truth, not attempt aggregation

Change `computeTaskResult` signature to accept optional engine-derived stats:

```ts
export function computeTaskResult(
  attempts: AttemptLog[],
  totalSteps: number,
  mode: TaskMode,
  lessonId?: string,
  chapterId?: number,
  version: "V1" | "V2" = "V1",
  engineStats?: { completedSteps: number; totalExpectedNotes: number }
): TaskResultSummary
```

New V2 logic:
- `correctSteps = engineStats.completedSteps` (from engine, not attempt aggregation)
- `totalExpectedNotes = engineStats.totalExpectedNotes` (from lesson structure)
- `correctNotes`: for completed steps, all notes count. For incomplete steps, count unique expected midis that got a success. This avoids retry/duplicate inflation.

```ts
if (version === "V2" && engineStats) {
  correctSteps = engineStats.completedSteps;
  totalExpectedNotes = engineStats.totalExpectedNotes;
  
  // correctNotes: completed steps contribute all their notes.
  // For the incomplete/partial step, count unique expected midis with success.
  const completedNotes = correctSteps > 0
    ? attempts
        .filter(a => a.stepIndex < correctSteps && a.success)
        // But we need notes-per-step from structure... 
        // Simpler: completedSteps * avg notes won't work.
        // Best: all expected notes for completed steps are correct by definition
    : 0;
  // Since we don't have the step structure here, derive from attempts:
  // Group by stepIndex, for steps < completedSteps: count unique expected midis
  const stepNoteCount = new Map<number, Set<number>>();
  for (const a of attempts) {
    if (!stepNoteCount.has(a.stepIndex)) stepNoteCount.set(a.stepIndex, new Set());
    const expected = Array.isArray(a.expected) ? a.expected : [a.expected];
    expected.forEach(e => stepNoteCount.get(a.stepIndex)!.add(e));
  }
  // Completed steps: all expected notes are correct
  let cn = 0;
  for (const [si, expectedSet] of stepNoteCount) {
    if (si < correctSteps) {
      cn += expectedSet.size; // all notes of completed step
    } else {
      // Partial: count unique expected midis with at least one success
      const successMidis = new Set<number>();
      for (const a of attempts) {
        if (a.stepIndex === si && a.success) {
          const midis = Array.isArray(a.midi) ? a.midi : [a.midi];
          midis.forEach(m => successMidis.add(m));
        }
      }
      const expArr = Array.from(expectedSet);
      cn += expArr.filter(e => successMidis.has(e)).length;
    }
  }
  correctNotes = cn;
}
```

V1 fallback unchanged (no `engineStats` needed, 1 attempt = 1 step).

**3. `src/viewer/index.tsx`** (~line 937) — Pass engine stats to `computeTaskResult`

```ts
const result = computeTaskResult(
  attempts,
  meta.totalSteps,
  practiceMode === 'FILM' ? 'FILM' : 'WAIT',
  meta.lessonId ?? undefined,
  meta.chapterId ?? undefined,
  version,
  version === 'V2' ? {
    completedSteps: engine.getCompletedSteps(),
    totalExpectedNotes: engine.getTotalExpectedNotes(),
  } : undefined
);
```

**4. `src/viewer/types/task.ts`** — No structural change needed (fields already exist)

The existing `totalExpectedNotes`, `correctNotes`, `noteAccuracy` fields stay. Their semantics just become correct.

### What this fixes

| Metric | Before (broken) | After (correct) |
|--------|-----------------|-----------------|
| `completedSteps` | Attempt aggregation (retries break it) | `engine.score` (ground truth) |
| `totalExpectedNotes` | `attempts.length` (inflates with retries) | `sum(step.notes.length)` from lesson |
| `correctNotes` | `attempts.filter(success).length` (inflates) | Unique expected notes satisfied per step |
| `stepAccuracy` | Could be 0% even with completed steps | Always correct: completedSteps/totalSteps |

### Risks

- V1 unaffected (no `engineStats` passed, falls through to existing logic)
- FILM mode: `logFilmAttempt` logs one attempt per step (not per note), so `correctSteps` from engine is still the right source. `totalExpectedNotes` from engine structure is also correct.
- Existing tests should pass since V1 path is unchanged. V2 path gets more accurate, not less.
- Endscreen UI unchanged (already shows "Steps Corretos" and "Acuracia (Notas)")

### Validation checklist

- V2 WAIT: 20 steps × 2 notes → `totalExpectedNotes = 40`, `correctSteps ≤ 20`, `stepAccuracy ≤ 100%`
- V2 WAIT with retries: step completed after miss → still counts as completed
- V2 FILM: same correctness guarantees
- V1: no regression
- `noteAccuracy` reflects unique notes satisfied, not raw success count

