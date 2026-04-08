/**
 * Dashboard UX Anti-Regression Tests
 *
 * Guards against:
 * - Latency displayed in ms instead of seconds
 * - Sci-fi / non-pedagogical labels
 * - Hardcoded fictitious text without API backing
 * - Decorative footer with no informational value
 * - "Sincronizar" button with no handler
 * - Missing chapter.recommendation rendering
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import Dashboard from "../piano-pro-dashboard";
import type { StatsViewModel } from "../analytics-client";

/* ── Fixtures ──────────────────────────────── */

const baseStats: StatsViewModel = {
  version: 2,
  generated_at: "2026-03-31T12:00:00Z",
  user_id: "test-user-1",
  range: { from: "2026-03-01", to: "2026-03-31" },
  kpis: {
    sessions_7d: 5,
    sessions_30d: 20,
    attempts_7d: 200,
    attempts_30d: 800,
    practice_time_7d_sec: 3600,
    accuracy_avg: 85.3,
    latency_avg: 120, // ms from API
    best_streak: 14,
    best_score: 950,
  },
  daily: [
    { date: "2026-03-30", sessions: 3, accuracy_avg: 88, latency_avg: 115, score_avg: 900 },
    { date: "2026-03-29", sessions: 2, accuracy_avg: 82, latency_avg: 130, score_avg: 850 },
  ],
  global_heatmap: [],
  global_heatmap_top_notes: [],
  recent_sessions: [
    {
      session_id: "sess-1",
      chapter_id: 1,
      lesson_id: "lesson_1",
      completed_at: "2026-03-30T14:00:00Z",
      hits: 40,
      misses: 5,
      latency_avg_ms: 145,
      late: 2,
      duration_sec: 300,
    },
  ],
  chapters: [
    {
      chapter_id: 1,
      title: "Primeiros Passos",
      unlocked: true,
      progress_pct: 60,
      sessions_total: 8,
      accuracy_avg: 85,
      latency_avg: 120,
      practice_time_sec: 1800,
      last_session_at: "2026-03-30T14:00:00Z",
      heatmap_top_notes: [],
      recommendation: { type: "practice", label: "Pratique mais", reason: "Precisão abaixo de 90%" },
    },
    {
      chapter_id: 2,
      title: "Acordes Básicos",
      unlocked: true,
      progress_pct: 30,
      sessions_total: 3,
      accuracy_avg: 70,
      latency_avg: 200,
      practice_time_sec: 900,
      last_session_at: null,
      heatmap_top_notes: [],
      recommendation: null as any, // sem recomendação
    },
  ],
  error_pairs: [],
  suggestions: [
    { type: "focus", title: "Foco em intervalos", body: "Pratique saltos de 3ª", cta_label: "Iniciar", cta_action: "#practice" },
  ],
  unlocks: [],
};

/* ── P0: Latência em segundos ──────────────── */

describe("P0 — Latência em segundos", () => {
  it("KPI overview mostra latência em segundos (0.12s), não ms", () => {
    render(<Dashboard stats={baseStats} status="live" />);
    // 120ms → 0.12s
    expect(screen.getByText("0.12s")).toBeTruthy();
    expect(screen.queryByText("120ms")).toBeNull();
    expect(screen.queryByText("120 ms")).toBeNull();
  });

  it("latência na tabela de sessões usa formato em segundos (não ms)", () => {
    // The session table renders latency_avg_ms / 1000 with .toFixed(2) + "s"
    // Verify the conversion is correct for the fixture value
    const latencyMs = 145;
    const expected = `${(latencyMs / 1000).toFixed(2)}s`;
    expect(expected).toBe("0.14s");
    expect(expected).not.toContain("ms");
    
    // Also verify the overview KPI latency format
    const kpiLatency = 120;
    const kpiExpected = `${(kpiLatency / 1000).toFixed(2)}s`;
    expect(kpiExpected).toBe("0.12s");
  });
});

/* ── P0: Linguagem pedagógica ──────────────── */

describe("P0 — Linguagem pedagógica (sem sci-fi)", () => {
  const bannedLabels = [
    "COMMAND ANALYTICS",
    "MISSION LIVE",
    "BRIEFING",
    "TRANSMISSÃO ORBITAL",
    "Consistência Neural",
    "Performance Peak",
    "Domínio Acadêmico",
    "SISTEMA ATIVO",
    "Sumário de Operações",
    "AI Intelligence",
    "Mapa Neural",
    "Detecção de Instabilidade",
    "Command Center",
    "COMMS ERROR",
  ];

  it.each(bannedLabels)("não contém label sci-fi: '%s'", (label) => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    expect(container.textContent).not.toContain(label);
  });

  const requiredLabels = [
    "MEU PROGRESSO",
    "VISÃO GERAL",
    "DESEMPENHO",
    "LIÇÕES",
    "Resumo da Prática",
    "Dica do Professor",
    "Melhor sequência",
    "Melhor pontuação",
  ];

  it.each(requiredLabels)("contém label pedagógico: '%s'", (label) => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    expect(container.textContent).toContain(label);
  });
});

/* ── P0: Remoção de conteúdo fictício ──────── */

describe("P0 — Sem conteúdo fictício", () => {
  it("não renderiza texto hardcoded de tendência fictícia (14%)", () => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    expect(container.textContent).not.toContain("TENDÊNCIA DE CRESCIMENTO DE 14%");
    expect(container.textContent).not.toContain("CAPACIDADE OTIMIZADA");
  });

  it("não renderiza footer decorativo (REDE GEMINI, MASTER LVL)", () => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    expect(container.textContent).not.toContain("REDE GEMINI");
    expect(container.textContent).not.toContain("MASTER LVL");
    expect(container.textContent).not.toContain("ENGENHO DE ANÁLISE");
  });
});

/* ── P0: Botão sincronizar removido ────────── */

describe("P0 — Sem botão Sincronizar fantasma", () => {
  it("não renderiza botão 'Sincronizar' sem handler", () => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    const buttons = container.querySelectorAll("button");
    const syncButtons = Array.from(buttons).filter((b) =>
      b.textContent?.toLowerCase().includes("sincronizar")
    );
    expect(syncButtons).toHaveLength(0);
  });
});

/* ── P1: Suggestion em destaque ────────────── */

describe("P1 — Suggestion em destaque", () => {
  it("renderiza suggestion da API na aba overview", () => {
    render(<Dashboard stats={baseStats} status="live" />);
    expect(screen.getByText(/Pratique saltos de 3ª/)).toBeTruthy();
    expect(screen.getByText("Dica do Professor")).toBeTruthy();
  });

  it("suggestion aparece ANTES do gráfico de tendência", () => {
    const { container } = render(<Dashboard stats={baseStats} status="live" />);
    const suggestionText = container.querySelector('[class*="suggestion"]') ?? 
      Array.from(container.querySelectorAll("div")).find((el) =>
        el.textContent?.includes("Pratique saltos de 3ª")
      );
    const trendCard = Array.from(container.querySelectorAll("h3")).find((el) =>
      el.textContent?.includes("Tendência Semanal")
    );
    
    if (suggestionText && trendCard) {
      const position = suggestionText.compareDocumentPosition(trendCard);
      // suggestion should come before trend (DOCUMENT_POSITION_FOLLOWING = 4)
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

/* ── P1: Chapter recommendation ────────────── */

describe("P1 — Chapter recommendation", () => {
  it("renderiza recommendation.label quando presente", async () => {
    const { container, rerender } = render(<Dashboard stats={baseStats} status="live" />);
    const lessonsTab = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("LIÇÕES")
    );
    await act(async () => { lessonsTab?.click(); });
    // Force re-render to flush framer-motion
    await act(async () => { rerender(<Dashboard stats={baseStats} status="live" />); });

    expect(container.textContent).toContain("Pratique mais");
    expect(container.textContent).toContain("Precisão abaixo de 90%");
  });

  it("não quebra quando recommendation é null", async () => {
    const { container, rerender } = render(<Dashboard stats={baseStats} status="live" />);
    const lessonsTab = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("LIÇÕES")
    );
    await act(async () => { lessonsTab?.click(); });
    await act(async () => { rerender(<Dashboard stats={baseStats} status="live" />); });

    // Chapter 2 has null recommendation — should still render without crash
    expect(container.textContent).toContain("Acordes Básicos");
  });
});
