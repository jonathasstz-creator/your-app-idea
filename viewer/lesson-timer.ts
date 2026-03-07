/**
 * Auto-start rule for pushEvent in index.tsx.
 * Extracted as a pure function to be unit-testable.
 * NOTE: shipped with a stub that ignores isEnded — Teste 0 will fail (RED).
 * Fix: add `&& !isEnded` to the guard.
 */
export function maybeStartLessonTimer(
    eventType: string,
    timer: LessonTimer | undefined,
    isEnded: boolean
): void {
    if (
        (eventType === 'note_on' || eventType === 'note_result') &&
        timer !== undefined &&
        !timer.isRunning() &&
        !isEnded // ← guard: não reinicia após forceEnd/endLesson
    ) {
        timer.start();
    }
}

export class LessonTimer {
    private startTime: number = 0;
    private elapsedFrozen: number = 0;
    private running: boolean = false;
    private intervalId: number | null = null;
    private onTick: ((ms: number) => void) | null = null;

    constructor(onTick?: (ms: number) => void) {
        this.onTick = onTick || null;
    }

    start() {
        if (this.running) return;

        this.startTime = Date.now() - this.elapsedFrozen;
        this.running = true;

        this.intervalId = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.startTime;
            if (this.onTick) this.onTick(elapsed);
        }, 100) as unknown as number;
    }

    stop() {
        if (!this.running) return;

        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.elapsedFrozen = Date.now() - this.startTime;
        this.running = false;
    }

    reset() {
        this.stop();
        this.elapsedFrozen = 0;
        this.startTime = 0;
        if (this.onTick) this.onTick(0);
    }

    getElapsed(): number {
        if (this.running) {
            return Date.now() - this.startTime;
        }
        return this.elapsedFrozen;
    }

    isRunning(): boolean {
        return this.running;
    }
}
