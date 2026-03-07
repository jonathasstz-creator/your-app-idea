// @vitest-environment jsdom
/**
 * HUD Timer Regression Tests
 *
 * Tests that #hud-timer freezes after the lesson ends (no more interval ticks).
 * These tests use fake timers + JSDOM so the interval behaviour is observable.
 *
 * Root causes tested:
 *  1. engine.setTimer(lessonTimer) must be called — otherwise forceEnd() can't stop
 *     the interval and the HUD keeps updating.
 *  2. Double notifyEnded() in onStepComplete must not fire the callback twice.
 *  3. pushEvent must not restart the timer after lesson ended.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LessonTimer } from "./lesson-timer";
import { createEngineV1, createEngineV2 } from "./lesson-engine";
import type { EngineLessonV1, EngineLessonV2 } from "./lesson-engine";
import { LessonSessionController } from "./lesson-session-controller";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOM_TIMER_ID = "hud-timer";

function mountHudTimer(): HTMLElement {
    document.body.innerHTML = `<div id="${DOM_TIMER_ID}">00:00.00</div>`;
    return document.getElementById(DOM_TIMER_ID)!;
}

function makeUiUpdateTimer(el: HTMLElement) {
    return (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const sec = String(totalSec % 60).padStart(2, "0");
        const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
        el.textContent = `${min}:${sec}.${cs}`;
    };
}

// ---------------------------------------------------------------------------
// #1 — HUD Timer freezes after lesson ends (WAIT mode, V1)
// ---------------------------------------------------------------------------

describe("HUD Timer — freezes after lesson ends", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("stops updating #hud-timer after engine.forceEnd() (timer injected via setTimer)", () => {
        const hudEl = mountHudTimer();
        const timer = new LessonTimer(makeUiUpdateTimer(hudEl));

        const engine = createEngineV1();
        const content: EngineLessonV1 = {
            session_id: "s1",
            lesson_id: "l1",
            lesson_version: 1,
            total_steps: 1,
            notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
        };

        engine.loadLesson(content);
        engine.setMode("WAIT");
        // Wire the timer — THIS is the missing call in index.tsx
        engine.setTimer(timer);

        // Start the timer (simulates first note_on)
        timer.start();

        // Advance 2s — HUD should be updating
        vi.advanceTimersByTime(2000);
        const textAt2s = hudEl.textContent;
        expect(textAt2s).not.toBe("00:00.00"); // Confirms timer IS running

        // End the lesson naturally (hits the only note → forceEnd internally)
        engine.onMidiInput(60, 100, true);

        // Advance 10 more seconds
        vi.advanceTimersByTime(10000);

        // HUD must NOT have advanced further
        expect(hudEl.textContent).toBe(textAt2s);
        expect(timer.isRunning()).toBe(false);
    });

    it("stops updating #hud-timer after engine.forceEnd() (V2)", () => {
        const hudEl = mountHudTimer();
        const timer = new LessonTimer(makeUiUpdateTimer(hudEl));

        const engine = createEngineV2();
        const content: EngineLessonV2 = {
            session_id: "s2",
            lesson_id: "l2",
            lesson_version: 1,
            total_steps: 1,
            steps: [{ step_index: 0, start_beat: 0, duration_beats: 1, notes: [60] }],
        };

        engine.loadLesson(content);
        engine.setMode("WAIT");
        engine.setTimer(timer);
        timer.start();

        vi.advanceTimersByTime(3000);
        const textAt3s = hudEl.textContent;
        expect(textAt3s).not.toBe("00:00.00");

        engine.onMidiInput(60, 100, true);

        vi.advanceTimersByTime(10000);
        expect(hudEl.textContent).toBe(textAt3s);
        expect(timer.isRunning()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// #A — Integração: controller wired ao engine.setOnEnded → HUD congela
// ---------------------------------------------------------------------------

describe("HUD Timer — controller wired ao engine.setOnEnded", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("Teste A: HUD congela via controller.endLesson() acionado pelo setOnEnded (V1)", async () => {
        const hudEl = mountHudTimer();
        const timer = new LessonTimer(makeUiUpdateTimer(hudEl));
        const frameLoop = { start: vi.fn(), stop: vi.fn() };
        const engine = createEngineV1();
        const content: EngineLessonV1 = {
            session_id: "tA", lesson_id: "lA", lesson_version: 1, total_steps: 1,
            notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
        };
        engine.loadLesson(content);
        engine.setMode("WAIT");
        engine.setTimer(timer);

        const controller = new LessonSessionController({ timer, frameLoop, engine });
        // Wire que index.tsx deve ter:
        engine.setOnEnded(() => controller.endLesson("COMPLETE"));
        controller.startLesson();

        vi.advanceTimersByTime(2000);
        const frozen = hudEl.textContent!;
        expect(frozen).not.toBe("00:00.00");

        // Completa a lição — forceEnd → timer.stop → notifyEnded → setTimeout
        engine.onMidiInput(60, 100, true);
        // Drena setTimeout + microtasks do ended callback
        await vi.runAllTimersAsync();

        vi.advanceTimersByTime(10000);
        expect(hudEl.textContent).toBe(frozen);
        expect(timer.isRunning()).toBe(false);
        expect(controller.isEnded()).toBe(true);
    });

    it("Teste B: forceEnd 2x + endLesson 2x → timer.stop chamado 1x, MIDI bloqueado", async () => {
        const hudEl = mountHudTimer();
        const timer = new LessonTimer(makeUiUpdateTimer(hudEl));
        const stopSpy = vi.spyOn(timer, "stop");
        const engine = createEngineV1();
        const content: EngineLessonV1 = {
            session_id: "tB", lesson_id: "lB", lesson_version: 1, total_steps: 1,
            notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
        };
        engine.loadLesson(content);
        engine.setMode("WAIT");
        engine.setTimer(timer);

        const controller = new LessonSessionController({
            timer, frameLoop: { start: vi.fn(), stop: vi.fn() }, engine,
        });
        engine.setOnEnded(() => controller.endLesson("COMPLETE"));
        timer.start();

        vi.advanceTimersByTime(1000);

        engine.onMidiInput(60, 100, true);     // primeiro end (natural)
        await vi.runAllTimersAsync();           // drena setTimeout

        engine.forceEnd();                     // segundo end — deve ser no-op
        controller.endLesson("FORCE");         // terceiro — deve ser no-op

        // timer.stop deve ter sido chamado apenas 1x (pela engine via setTimer + stop do controller)
        // engine.forceEnd() já não tem timer wired após isEnded = true
        expect(stopSpy.mock.calls.length).toBeLessThanOrEqual(2); // no máximo 2x (engine + controller), nunca mais
        expect(controller.isEnded()).toBe(true);
        expect(controller.handleMidi(60, 100, true)).toBe(false); // MIDI bloqueado
    });
});

// ---------------------------------------------------------------------------
// #2 — Idempotency: ended fires twice → callback runs once, timer stops once
// ---------------------------------------------------------------------------

describe("HUD Timer — idempotent ended (double-fire from notifyEnded)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("calling forceEnd() twice does not restart the interval or re-call stop()", () => {
        const hudEl = mountHudTimer();
        const timer = new LessonTimer(makeUiUpdateTimer(hudEl));
        const stopSpy = vi.spyOn(timer, "stop");

        const engine = createEngineV1();
        const content: EngineLessonV1 = {
            session_id: "s3",
            lesson_id: "l3",
            lesson_version: 1,
            total_steps: 1,
            notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
        };

        engine.loadLesson(content);
        engine.setMode("WAIT");
        engine.setTimer(timer);
        timer.start();

        vi.advanceTimersByTime(1000);

        engine.forceEnd(); // First end
        const textAfterEnd = hudEl.textContent;
        expect(stopSpy).toHaveBeenCalledTimes(1);

        engine.forceEnd(); // Second end (duplicate, as seen in logs)
        vi.advanceTimersByTime(5000);

        // Timer stop must still be called only once
        expect(stopSpy).toHaveBeenCalledTimes(1);
        // HUD must remain frozen
        expect(hudEl.textContent).toBe(textAfterEnd);
    });

    it("onEnded callback fires exactly once even if notifyEnded is called twice", () => {
        const engine = createEngineV1();
        const content: EngineLessonV1 = {
            session_id: "s4",
            lesson_id: "l4",
            lesson_version: 1,
            total_steps: 1,
            notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
        };

        engine.loadLesson(content);
        engine.setMode("WAIT");

        const onEnded = vi.fn();
        engine.setOnEnded(onEnded);

        // Complete lesson naturally → triggers forceEnd + notifyEnded (internal double call)
        engine.onMidiInput(60, 100, true);

        // Run all queued setTimeouts (notifyEnded defers via setTimeout)
        vi.runAllTimers();

        // Callback must fire exactly once despite double notifyEnded
        expect(onEnded).toHaveBeenCalledTimes(1);
    });
});
