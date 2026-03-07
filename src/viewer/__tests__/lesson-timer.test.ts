import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LessonTimer, maybeStartLessonTimer } from "../lesson-timer";

// ---------------------------------------------------------------------------
// maybeStartLessonTimer — does not restart timer after lesson ends
// ---------------------------------------------------------------------------
describe("maybeStartLessonTimer — does not restart timer after lesson ends", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

    it("does not restart the timer when isEnded=true, even if timer is stopped", () => {
        const timer = new LessonTimer();
        timer.start();
        vi.advanceTimersByTime(1000);
        timer.stop(); // simulates forceEnd() stopping the timer

        // pushEvent("note_on") runs in the same tick with isEnded=true
        maybeStartLessonTimer("note_on", timer, true);

        expect(timer.isRunning()).toBe(false);
    });

    it("starts the timer on first note if lesson has not ended (normal behavior)", () => {
        const timer = new LessonTimer();
        maybeStartLessonTimer("note_on", timer, false);
        expect(timer.isRunning()).toBe(true);
        timer.stop();
    });

    it("does not start for events that are not note_on/note_result", () => {
        const timer = new LessonTimer();
        maybeStartLessonTimer("session_start", timer, false);
        expect(timer.isRunning()).toBe(false);
    });

    it("does not restart stopped timer when isEnded=true (note_result)", () => {
        const timer = new LessonTimer();
        timer.start();
        vi.advanceTimersByTime(500);
        timer.stop();

        maybeStartLessonTimer("note_result", timer, true);
        expect(timer.isRunning()).toBe(false);
    });
});

describe("LessonTimer stops on completion", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it("should stop ticking after lesson completes (stop is called)", () => {
        const onTick = vi.fn();
        const timer = new LessonTimer(onTick);

        timer.start();
        vi.advanceTimersByTime(3000);
        expect(onTick).toHaveBeenCalled();

        const timeBeforeFinish = timer.getElapsed();
        const callCountBeforeStop = onTick.mock.calls.length;

        timer.stop();

        vi.advanceTimersByTime(10000);

        expect(timer.getElapsed()).toBe(timeBeforeFinish);
        expect(timer.isRunning()).toBe(false);
        expect(onTick.mock.calls.length).toBe(callCountBeforeStop);
    });

    it("should handle multiple stops idempotently", () => {
        const onTick = vi.fn();
        const timer = new LessonTimer(onTick);
        timer.start();
        vi.advanceTimersByTime(1000);

        timer.stop();
        const elapsed1 = timer.getElapsed();

        vi.advanceTimersByTime(1000);
        timer.stop(); // Second stop should not affect anything

        expect(timer.getElapsed()).toBe(elapsed1);
        expect(timer.isRunning()).toBe(false);
    });
});
