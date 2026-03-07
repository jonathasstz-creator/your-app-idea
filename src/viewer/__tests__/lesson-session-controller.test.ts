import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LessonSessionController } from "../lesson-session-controller";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimer() {
    return { start: vi.fn(), stop: vi.fn(), getElapsed: vi.fn(() => 3000) };
}

function makeFrameLoop() {
    return { start: vi.fn(), stop: vi.fn() };
}

function makeEngine() {
    return {
        tick: vi.fn(),
        onMidiInput: vi.fn(() => ({ result: "HIT" })),
        getViewState: vi.fn(() => ({ status: "RUNNING" })),
        forceEnd: vi.fn(),
    };
}

function makeController(overrides?: {
    timer?: ReturnType<typeof makeTimer>;
    frameLoop?: ReturnType<typeof makeFrameLoop>;
    engine?: ReturnType<typeof makeEngine>;
}) {
    const timer = overrides?.timer ?? makeTimer();
    const frameLoop = overrides?.frameLoop ?? makeFrameLoop();
    const engine = overrides?.engine ?? makeEngine();
    const controller = new LessonSessionController({ timer, frameLoop, engine });
    return { controller, timer, frameLoop, engine };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LessonSessionController — endLesson stops everything", () => {
    it("endLesson() stops frame loop and timer", () => {
        const { controller, timer, frameLoop } = makeController();

        controller.startLesson();
        controller.endLesson("COMPLETE");

        expect(frameLoop.stop).toHaveBeenCalledTimes(1);
        expect(timer.stop).toHaveBeenCalledTimes(1);
    });

    it("endLesson() blocks MIDI from reaching engine", () => {
        const { controller, engine } = makeController();

        controller.startLesson();
        controller.endLesson("COMPLETE");

        const accepted = controller.handleMidi(60, 100, true);

        expect(accepted).toBe(false);
        expect(engine.onMidiInput).not.toHaveBeenCalled();
    });

    it("endLesson() is idempotent — stop called exactly once even if called twice", () => {
        const { controller, timer, frameLoop } = makeController();

        controller.startLesson();
        controller.endLesson("COMPLETE");
        controller.endLesson("FORCE"); // second call must be no-op

        expect(frameLoop.stop).toHaveBeenCalledTimes(1);
        expect(timer.stop).toHaveBeenCalledTimes(1);
    });

    it("handleMidi passes through to engine before lesson ends", () => {
        const { controller, engine } = makeController();

        controller.startLesson();

        const accepted = controller.handleMidi(60, 100, true);

        expect(accepted).toBe(true);
        expect(engine.onMidiInput).toHaveBeenCalledWith(60, 100, true);
    });

    it("dispose() is an alias for endLesson", () => {
        const { controller, timer, frameLoop } = makeController();

        controller.startLesson();
        controller.dispose();

        expect(frameLoop.stop).toHaveBeenCalledTimes(1);
        expect(timer.stop).toHaveBeenCalledTimes(1);
        expect(controller.isEnded()).toBe(true);
    });

    it("isEnded() returns false before end and true after", () => {
        const { controller } = makeController();

        controller.startLesson();
        expect(controller.isEnded()).toBe(false);

        controller.endLesson("COMPLETE");
        expect(controller.isEnded()).toBe(true);
    });
});

describe("LessonSessionController — handleMidi isolates engine errors", () => {
    it("engine.onMidiInput that throws does not propagate via handleMidi", () => {
        const throwingEngine = {
            tick: vi.fn(),
            onMidiInput: vi.fn(() => { throw new Error("wsTransport.send is not a function"); }),
            getViewState: vi.fn(() => ({ status: "RUNNING" })),
            forceEnd: vi.fn(),
        };
        const { controller, timer } = makeController({ engine: throwingEngine });
        controller.startLesson();

        expect(() => controller.handleMidi(60, 100, true)).not.toThrow();

        controller.endLesson("COMPLETE");
        expect(controller.isEnded()).toBe(true);
        expect(timer.stop).toHaveBeenCalledTimes(1);
    });
});
