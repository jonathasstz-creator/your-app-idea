import { describe, expect, it, beforeEach } from "vitest";
import { PracticeMode, TransportClient } from "./transport-client";

// Minimal browser stubs
beforeEach(() => {
  (globalThis as any).window = {
    matchMedia: () => ({ matches: false }),
  };
  (globalThis as any).requestAnimationFrame = (cb: any) => {
    const id = setTimeout(() => cb(performance.now()), 0);
    return id as unknown as number;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as number);
});

describe("TransportClient", () => {
  it("integrates beats over time", () => {
    const client = new TransportClient();
    client.setMode(PracticeMode.TIME_FILM);
    const internal = client as any;
    internal.beatNow = 0;
    internal.lastFramePerfMs = 0;
    internal.status = "PLAYING";
    internal.bpm = 120;

    for (let i = 0; i < 20; i += 1) {
      internal.integrate((i + 1) * 50); // 20 * 50ms = 1s (2 beats at 120 bpm)
    }

    const snap = client.getSnapshot();
    expect(snap.transportBeat).toBeCloseTo(2);
    expect(snap.exerciseBeat).toBeCloseTo(Math.max(0, 2 - snap.countInBeats));
  });

  it("partially snaps on large server error", () => {
    const client = new TransportClient();
    client.setMode(PracticeMode.TIME_FILM);
    client.onServerTransportUpdate({ bpm: 120, transport_beat: 0 });

    const internal = client as any;
    internal.beatNow = 0;
    internal.lastServerBeat = 0;
    internal.lastFramePerfMs = performance.now();

    client.onServerTransportUpdate({ bpm: 120, transport_beat: 2 });
    const snap = client.getSnapshot();
    // With alphaPos=0.12 and error=2.0, expected = 0 + 2 * 0.12 = 0.24
    expect(snap.transportBeat).toBeCloseTo(0.24, 2);
    expect(snap.driftMs).toBeLessThan(1500);
  });

  it("applies small PLL correction smoothly", () => {
    const client = new TransportClient();
    client.setMode(PracticeMode.TIME_FILM);
    const internal = client as any;
    internal.beatNow = 1;
    internal.lastServerBeat = 1;
    internal.lastFramePerfMs = performance.now();

    client.onServerTransportUpdate({ bpm: 120, transport_beat: 1.5 });
    const snap = client.getSnapshot();
    // alphaPos default ~0.12 -> expect ~1.06
    expect(snap.transportBeat).toBeGreaterThan(1);
    expect(snap.transportBeat).toBeLessThan(1.2);
  });
});
