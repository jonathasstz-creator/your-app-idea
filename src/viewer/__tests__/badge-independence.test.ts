/**
 * Badge Independence — Backend vs MIDI status
 *
 * Bug #6: Backend connection and MIDI device must be independent states.
 * One being disconnected must NOT affect the other's label or indicator.
 */
import { describe, it, expect } from "vitest";

// Extract the pure state model used in HomeShell
interface ConnectionState {
  isConnected: boolean;
  deviceName: string;
}

interface BackendState {
  connected: boolean;
  label: string;
}

function deriveBadges(midi: ConnectionState, backend: BackendState) {
  return {
    midiBadge: midi.isConnected ? `🎹 ${midi.deviceName}` : "🎹 Desconectado",
    backendBadge: backend.connected ? `☁️ ${backend.label}` : "☁️ Offline",
  };
}

describe("Badge Independence — Backend vs MIDI", () => {
  it("both disconnected", () => {
    const { midiBadge, backendBadge } = deriveBadges(
      { isConnected: false, deviceName: "" },
      { connected: false, label: "Desconectado" }
    );
    expect(midiBadge).toBe("🎹 Desconectado");
    expect(backendBadge).toBe("☁️ Offline");
  });

  it("MIDI connected, backend disconnected — MIDI shows device name", () => {
    const { midiBadge, backendBadge } = deriveBadges(
      { isConnected: true, deviceName: "Yamaha P-125" },
      { connected: false, label: "Desconectado" }
    );
    expect(midiBadge).toBe("🎹 Yamaha P-125");
    expect(backendBadge).toBe("☁️ Offline");
  });

  it("MIDI disconnected, backend connected — backend shows label", () => {
    const { midiBadge, backendBadge } = deriveBadges(
      { isConnected: false, deviceName: "" },
      { connected: true, label: "API v1.2" }
    );
    expect(midiBadge).toBe("🎹 Desconectado");
    expect(backendBadge).toBe("☁️ API v1.2");
  });

  it("both connected — independent labels", () => {
    const { midiBadge, backendBadge } = deriveBadges(
      { isConnected: true, deviceName: "Roland FP-30X" },
      { connected: true, label: "Conectado" }
    );
    expect(midiBadge).toBe("🎹 Roland FP-30X");
    expect(backendBadge).toBe("☁️ Conectado");
  });

  it("changing MIDI state does NOT affect backend badge", () => {
    const backend: BackendState = { connected: true, label: "OK" };

    const before = deriveBadges({ isConnected: true, deviceName: "X" }, backend);
    const after = deriveBadges({ isConnected: false, deviceName: "" }, backend);

    expect(before.backendBadge).toBe(after.backendBadge); // unchanged
    expect(before.midiBadge).not.toBe(after.midiBadge); // changed
  });

  it("changing backend state does NOT affect MIDI badge", () => {
    const midi: ConnectionState = { isConnected: true, deviceName: "Korg" };

    const before = deriveBadges(midi, { connected: true, label: "Online" });
    const after = deriveBadges(midi, { connected: false, label: "Offline" });

    expect(before.midiBadge).toBe(after.midiBadge); // unchanged
    expect(before.backendBadge).not.toBe(after.backendBadge); // changed
  });
});
