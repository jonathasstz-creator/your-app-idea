/**
 * Complete Payload Invariants
 *
 * P-01, P-02, P-05, P-10:
 * - local_date must be in America/Sao_Paulo timezone
 * - /complete must fire exactly once per session (guard against double callback)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Pure helper: format local date for São Paulo timezone */
function formatLocalDateSP(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // "YYYY-MM-DD"
}

/** Guard: fire-once wrapper */
function createFireOnce(fn: (payload: any) => Promise<void>): (payload: any) => Promise<void> {
  let fired = false;
  return async (payload: any) => {
    if (fired) {
      console.warn("[Complete] Duplicate call blocked");
      return;
    }
    fired = true;
    await fn(payload);
  };
}

describe("Complete Payload — local_date (America/Sao_Paulo)", () => {
  it("formats date correctly at 23:30 UTC (next day in UTC, same day in SP)", () => {
    // 2026-03-07T23:30:00Z = 2026-03-07T20:30:00 BRT (-03:00) = still March 7
    const date = new Date("2026-03-07T23:30:00Z");
    expect(formatLocalDateSP(date)).toBe("2026-03-07");
  });

  it("handles midnight crossing: 02:30 UTC = 23:30 BRT (previous day)", () => {
    // 2026-03-08T02:30:00Z = 2026-03-07T23:30:00 BRT = March 7
    const date = new Date("2026-03-08T02:30:00Z");
    expect(formatLocalDateSP(date)).toBe("2026-03-07");
  });

  it("normal daytime: 15:00 UTC = 12:00 BRT (same day)", () => {
    const date = new Date("2026-03-07T15:00:00Z");
    expect(formatLocalDateSP(date)).toBe("2026-03-07");
  });

  it("DST boundary: during Brazilian summer time (UTC-2 in some years)", () => {
    // In 2024 Brazil suspended DST, so this should still be UTC-3
    const date = new Date("2026-01-15T01:00:00Z");
    const localDate = formatLocalDateSP(date);
    // 01:00 UTC = 22:00 BRT (Jan 14)
    expect(localDate).toBe("2026-01-14");
  });
});

describe("Complete — Fire-Once Guard", () => {
  it("calls function exactly once", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const guarded = createFireOnce(fn);

    await guarded({ session_id: "s1" });
    await guarded({ session_id: "s1" }); // duplicate
    await guarded({ session_id: "s1" }); // triplicate

    expect(fn).toHaveBeenCalledOnce();
  });

  it("passes payload to the inner function", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const guarded = createFireOnce(fn);

    const payload = { session_id: "s1", local_date: "2026-03-07", score: 100 };
    await guarded(payload);

    expect(fn).toHaveBeenCalledWith(payload);
  });

  it("blocks duplicate even if first call rejects", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network"));
    const guarded = createFireOnce(fn);

    await guarded({}).catch(() => {}); // first call fails
    await guarded({}); // second call — blocked

    expect(fn).toHaveBeenCalledOnce();
  });

  it("different sessions need separate guards", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const guard1 = createFireOnce(fn);
    const guard2 = createFireOnce(fn);

    await guard1({ session_id: "s1" });
    await guard2({ session_id: "s2" });

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
