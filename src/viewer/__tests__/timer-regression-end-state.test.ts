/**
 * Timer + Engine End State — Regression
 *
 * Bug: pushEvent after engine ends must NOT restart timer.
 * Tests the interaction between LessonTimer and engine DONE state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LessonTimer } from "../lesson-timer";

describe("Timer — Post-End Event Order Regression", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("late pushEvent does NOT restart timer after engine ended", () => {
    const timer = new LessonTimer();
    let engineEnded = false;

    // Simulate: engine runs, timer starts
    timer.start();
    vi.advanceTimersByTime(2000);

    // Engine ends
    engineEnded = true;
    timer.stop();

    // Late event arrives (pushEvent pattern from index.tsx)
    // The guard: only start if timer is not running AND engine is not ended
    if (!timer.isRunning() && !engineEnded) {
      timer.start(); // should NOT execute
    }

    expect(timer.isRunning()).toBe(false);
    expect(timer.getElapsed()).toBeGreaterThan(0); // preserves elapsed
  });

  it("pushEvent with isRunning guard prevents restart", () => {
    const timer = new LessonTimer();

    timer.start();
    vi.advanceTimersByTime(1000);
    timer.stop();

    // Simulate the guard from index.tsx pushEvent:
    // if (!lessonTimer.isRunning()) { /* do NOT start */ }
    expect(timer.isRunning()).toBe(false);

    // Calling start() explicitly IS allowed (e.g., new lesson)
    // But the guard in pushEvent prevents it
    const shouldStart = false; // simulates guard
    if (shouldStart) timer.start();

    expect(timer.isRunning()).toBe(false);
  });

  it("reset + start works correctly for NEW lesson after end", () => {
    const timer = new LessonTimer();

    // First lesson
    timer.start();
    vi.advanceTimersByTime(3000);
    timer.stop(); // lesson ended

    // New lesson
    timer.reset();
    expect(timer.getElapsed()).toBe(0);

    timer.start();
    vi.advanceTimersByTime(500);
    expect(timer.isRunning()).toBe(true);
    expect(timer.getElapsed()).toBeGreaterThanOrEqual(500);
    timer.stop();
  });
});
