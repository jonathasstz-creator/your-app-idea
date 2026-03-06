import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LocalTransportDriver } from "./local-transport-driver";

let now = 0;

const setNow = (value: number) => {
  now = value;
};

const getLast = (driver: LocalTransportDriver) => (driver as any).lastSlopeMeasurement;

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  (globalThis as any).requestAnimationFrame = () => 1 as unknown as number;
  (globalThis as any).cancelAnimationFrame = () => {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LocalTransportDriver SLOPE_CHECK baseline", () => {
  it("primes baseline on reset", () => {
    const driver = new LocalTransportDriver();
    setNow(1000);
    driver.reset();
    const last = getLast(driver);
    expect(last.time).toBe(1000);
    expect(last.measureAt).toBe(1000);
  });

  it("primes baseline on pause/resume", () => {
    const driver = new LocalTransportDriver();
    setNow(0);
    driver.start();

    setNow(200);
    driver.pause();
    let last = getLast(driver);
    expect(last.time).toBe(200);

    setNow(400);
    driver.resume();
    last = getLast(driver);
    expect(last.time).toBe(400);
  });

  it("resets baseline on dirty upper window without logging", () => {
    const driver = new LocalTransportDriver();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    setNow(0);
    driver.start();

    setNow(1500);
    (driver as any).emit();

    const last = getLast(driver);
    expect(last.time).toBe(1500);
    expect(logSpy).not.toHaveBeenCalledWith("[SLOPE_CHECK]", expect.anything());
  });

  it("resets baseline on dirty lower window without logging", () => {
    const driver = new LocalTransportDriver();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    setNow(1000);
    driver.start();

    setNow(1400);
    const beatNow = (driver as any).timeline.snapshot().beatNow;
    (driver as any).lastSlopeMeasurement = {
      beat: beatNow,
      time: 1000,
      measureAt: 800,
    };

    (driver as any).emit();

    const last = getLast(driver);
    expect(last.time).toBe(1400);
    expect(logSpy).not.toHaveBeenCalledWith("[SLOPE_CHECK]", expect.anything());
  });

  it("gates slope check when paused", () => {
    const driver = new LocalTransportDriver();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    setNow(0);
    driver.start();
    setNow(200);
    driver.pause();

    (driver as any).lastSlopeMeasurement = {
      beat: -99,
      time: 0,
      measureAt: 0,
    };

    setNow(400);
    (driver as any).emit();

    const last = getLast(driver);
    expect(last.time).toBe(400);
    expect(logSpy).not.toHaveBeenCalledWith("[SLOPE_CHECK]", expect.anything());
  });
});
