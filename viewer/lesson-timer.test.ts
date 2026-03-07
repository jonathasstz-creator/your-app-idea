import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LessonTimer, maybeStartLessonTimer } from "./lesson-timer";

// ---------------------------------------------------------------------------
// Teste 0 — REGRESSÃO: maybeStartLessonTimer não pode religar timer após fim
// ---------------------------------------------------------------------------
describe("maybeStartLessonTimer — não reinicia timer após lição terminar", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

    it("[RED→GREEN] não reinicia o timer quando isEnded=true, mesmo que timer esteja parado", () => {
        const timer = new LessonTimer();
        timer.start();
        vi.advanceTimersByTime(1000);
        timer.stop(); // simula forceEnd() parando o timer

        // pushEvent("note_on") roda no mesmo tick com isEnded=true
        // Falha por COMPORTAMENTO: stub ignora isEnded e reinicia o timer
        maybeStartLessonTimer("note_on", timer, true);

        // FALHA com stub (timer.isRunning() === true), VERDE com fix (isEnded guard)
        expect(timer.isRunning()).toBe(false);
    });

    it("inicia o timer na primeira nota se lição não terminou (comportamento normal)", () => {
        const timer = new LessonTimer();
        maybeStartLessonTimer("note_on", timer, false);
        expect(timer.isRunning()).toBe(true);
        timer.stop();
    });

    it("não inicia para eventos que não são note_on/note_result", () => {
        const timer = new LessonTimer();
        maybeStartLessonTimer("session_start", timer, false);
        expect(timer.isRunning()).toBe(false);
    });

    it("não reinicia timer parado quando isEnded=true (note_result)", () => {
        const timer = new LessonTimer();
        timer.start();
        vi.advanceTimersByTime(500);
        timer.stop();

        maybeStartLessonTimer("note_result", timer, true);
        expect(timer.isRunning()).toBe(false);
    });
});

describe("LessonTimer stops on completion", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("should stop ticking after lesson completes (stop is called)", () => {
        const onTick = vi.fn();
        const timer = new LessonTimer(onTick);

        timer.start();

        vi.advanceTimersByTime(3000);
        expect(onTick).toHaveBeenCalled(); // runs

        const timeBeforeFinish = timer.getElapsed();

        // Capture call count BEFORE stop
        const callCountBeforeStop = onTick.mock.calls.length;

        timer.stop(); // <- same real event that ends the lesson

        // Advance timers by another 10s to ensure it doesn't tick
        vi.advanceTimersByTime(10000);

        expect(timer.getElapsed()).toBe(timeBeforeFinish); // cannot increase
        expect(timer.isRunning()).toBe(false); // explicit contract

        // Ensure onTick is no longer called
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
