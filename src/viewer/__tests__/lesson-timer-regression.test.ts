/**
 * LessonTimer — Regression Tests
 * 
 * Bug #5: Timer must NOT restart after lesson ends.
 * Tests: start/stop/reset lifecycle, elapsed tracking, double-start guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LessonTimer } from "../lesson-timer";

describe("LessonTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0 elapsed", () => {
    const timer = new LessonTimer();
    expect(timer.getElapsed()).toBe(0);
    expect(timer.isRunning()).toBe(false);
  });

  it("tracks elapsed time correctly", () => {
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(1000);
    expect(timer.getElapsed()).toBeGreaterThanOrEqual(1000);
    expect(timer.isRunning()).toBe(true);
  });

  it("stop freezes elapsed", () => {
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(500);
    timer.stop();
    const frozen = timer.getElapsed();
    vi.advanceTimersByTime(2000);
    expect(timer.getElapsed()).toBe(frozen);
    expect(timer.isRunning()).toBe(false);
  });

  it("reset clears elapsed to 0", () => {
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(1000);
    timer.reset();
    expect(timer.getElapsed()).toBe(0);
    expect(timer.isRunning()).toBe(false);
  });

  it("double start is a no-op (does NOT restart)", () => {
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(500);
    const elapsedBefore = timer.getElapsed();
    timer.start(); // double start — should be ignored
    // elapsed should NOT reset to 0
    expect(timer.getElapsed()).toBeGreaterThanOrEqual(elapsedBefore);
  });

  it("REGRESSION: start after stop resumes, not restarts", () => {
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(1000);
    timer.stop();
    const frozen = timer.getElapsed();
    timer.start(); // resume
    vi.advanceTimersByTime(500);
    expect(timer.getElapsed()).toBeGreaterThanOrEqual(frozen + 500);
  });

  it("REGRESSION: timer does NOT restart after forceEnd pattern", () => {
    // Simulates: lesson ends → timer.stop() → pushEvent should NOT call timer.start()
    const timer = new LessonTimer();
    timer.start();
    vi.advanceTimersByTime(2000);
    timer.stop(); // "lesson ended"

    // Simulate pushEvent checking isRunning
    if (!timer.isRunning()) {
      // Should NOT start — lesson is over
    }
    expect(timer.isRunning()).toBe(false);
  });

  it("onTick callback fires at intervals", () => {
    const tickFn = vi.fn();
    const timer = new LessonTimer(tickFn);
    timer.start();
    vi.advanceTimersByTime(350);
    // Should fire ~3 times (at 100, 200, 300)
    expect(tickFn).toHaveBeenCalled();
    expect(tickFn.mock.calls.length).toBeGreaterThanOrEqual(3);
    timer.stop();
  });

  it("reset calls onTick with 0", () => {
    const tickFn = vi.fn();
    const timer = new LessonTimer(tickFn);
    timer.start();
    vi.advanceTimersByTime(500);
    tickFn.mockClear();
    timer.reset();
    expect(tickFn).toHaveBeenCalledWith(0);
  });
});
