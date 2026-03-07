/**
 * LessonSessionController
 *
 * Single owner of the three resources that must be shutdown atomically
 * when a lesson ends:
 *   1. Timer (interval)
 *   2. Frame loop (RAF / transport)
 *   3. MIDI gate (blocks handleMidi after ended)
 *
 * Contract:
 *   - startLesson()   → arms everything
 *   - endLesson(reason) → idempotent shutdown of all 3
 *   - handleMidi(...)   → no-op after endLesson
 *   - dispose()         → alias for endLesson("DISPOSE")
 */

export type EndReason = "COMPLETE" | "FORCE" | "DISPOSE";

export interface TimerLike {
    start(): void;
    stop(): void;
    getElapsed(): number;
}

export interface FrameLoopLike {
    start(): void;
    stop(): void;
}

export interface EngineLike {
    tick?(): void;
    onMidiInput?(midi: number, velocity: number, isOn: boolean): unknown;
    getViewState?(): { status: string };
    forceEnd?(): void;
}

export class LessonSessionController {
    private ended = false;

    constructor(
        private deps: {
            timer: TimerLike;
            frameLoop: FrameLoopLike;
            engine: EngineLike;
        }
    ) { }

    startLesson() {
        this.ended = false;
        this.deps.timer.start();
        this.deps.frameLoop.start();
    }

    endLesson(_reason: EndReason = "COMPLETE") {
        if (this.ended) return; // 🔒 idempotent
        this.ended = true;

        this.deps.frameLoop.stop();
        this.deps.timer.stop();
    }

    /**
     * MIDI gate — call this instead of engine.onMidiInput() directly.
     * Returns false and does nothing if lesson has ended.
     */
    handleMidi(midi: number, velocity: number, isOn: boolean): boolean {
        if (this.ended) return false;
        try {
            this.deps.engine.onMidiInput?.(midi, velocity, isOn);
        } catch (err) {
            console.warn('[LessonSessionController] handleMidi error (swallowed):', err);
        }
        return true;
    }

    isEnded(): boolean {
        return this.ended;
    }

    dispose() {
        this.endLesson("DISPOSE");
    }
}
