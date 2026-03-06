
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  Activity,
  Target,
  Zap,
  Brain,
  History,
  Layout,
  BarChart2,
  BookOpen,
  ArrowRight,
  Clock,
  Award,
} from "lucide-react";
import type {
  StatsErrorPair,
  StatsHeatmapNote,
  StatsSuggestion,
  StatsViewModel,
} from "./analytics-client";

interface DashboardProps {
  stats: StatsViewModel | null;
  status: "idle" | "loading" | "stale" | "live" | "error";
  lastUpdated?: number;
  error?: string;
  source?: string;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const safeNum = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);
const safeArr = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const safeStr = (value: unknown, fallback = "—") =>
  typeof value === "string" && value.trim() ? value : fallback;
const safeDateLabel = (value: unknown) => {
  const date = value ? new Date(value as any) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const fmt0 = (value: unknown) => (isFiniteNumber(value) ? nf0.format(value) : "—");
const fmt1 = (value: unknown) => (isFiniteNumber(value) ? nf1.format(value) : "—");

const formatTimestamp = (value?: number) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, seconds || 0);
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
};

const midiToNote = (midi: number) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12] ?? "?";
  return `${name}${octave}`;
};

const buildLinePoints = (values: number[], maxValue: number) => {
  if (!values.length) return "";
  const max = Math.max(maxValue, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - (clamp(value, 0, max) / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
};

const buildHeatmapGrid = (notes: StatsHeatmapNote[]) => {
  const map = new Map<number, StatsHeatmapNote>();
  notes.forEach((note) => map.set(note.midi, note));
  const midis = notes.map((note) => note.midi);
  const minMidi = midis.length ? Math.min(...midis) : 48;
  const maxMidi = midis.length ? Math.max(...midis) : 72;
  const minOctave = Math.max(1, Math.floor(minMidi / 12) - 1);
  const maxOctave = Math.min(7, Math.floor(maxMidi / 12) - 1);
  const octaves: number[] = [];
  for (let octave = maxOctave; octave >= minOctave; octave -= 1) octaves.push(octave);
  return { map, octaves };
};

const CollapsibleSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, defaultOpen = true, action, children, className }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`bg-white/5 border border-white/10 rounded-2xl overflow-hidden ${className ?? ""}`}>
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-cyan-400">{icon}</span> : null}
          <h4 className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            {title}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-colors"
          >
            {open ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </header>
      {open ? <div className="p-4 md:p-6">{children}</div> : null}
    </section>
  );
};

const FocusPanel: React.FC<{
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, open, onClose, children }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fechar painel"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative ml-auto h-full bg-[#080a12] border-l border-white/10 shadow-2xl flex flex-col outline-none ${isMobile ? "w-full" : "w-full sm:w-[560px]"
          }`}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Focus Mode</div>
            <h3 className="text-sm font-black text-white tracking-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white"
          >
            Fechar
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

const Pill: React.FC<{ tone?: "live" | "stale" | "loading" | "error"; children: React.ReactNode }> = ({
  tone = "stale",
  children,
}) => (
  <span
    className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${tone === "live"
        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
        : tone === "error"
          ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
          : "bg-slate-800 text-slate-500 border-slate-700"
      }`}
  >
    {children}
  </span>
);

const Card: React.FC<{
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}> = ({ title, icon, right, children, className, glow }) => (
  <motion.section
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-[#0d0e1c]/60 backdrop-blur-md border border-slate-800 rounded-3xl overflow-hidden flex flex-col ${className ?? ""
      } ${glow ? "shadow-[0_0_30px_rgba(0,242,255,0.05)] border-cyan-500/20" : ""}`}
  >
    <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon ? <div className="text-cyan-400 opacity-60">{icon}</div> : null}
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{title}</h3>
      </div>
      {right}
    </header>
    <div className="p-6 flex-1 min-h-0">{children}</div>
  </motion.section>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }> = ({
  label,
  value,
  sub,
  color = "text-cyan-400",
}) => (
  <div className="flex flex-col">
    <div className="text-[9px] text-slate-500 uppercase font-black mb-1 tracking-wider">{label}</div>
    <div className={`text-2xl md:text-3xl font-black ${color} tracking-tighter leading-tight`}>{value}</div>
    {sub ? <div className="text-[9px] text-slate-600 font-bold mt-1 uppercase tracking-widest">{sub}</div> : null}
  </div>
);

const SuggestionCard: React.FC<{ suggestion?: StatsSuggestion }> = ({ suggestion }) => {
  if (!suggestion) {
    return <div className="text-slate-600 text-[10px] italic">Processando insights...</div>;
  }
  return (
    <div className="bg-cyan-400/[0.03] border border-cyan-400/10 p-5 rounded-2xl relative overflow-hidden">
      <div className="text-cyan-400 font-black text-[11px] uppercase mb-2 flex items-center gap-2 tracking-[0.1em]">
        <Brain size={14} /> {safeStr(suggestion.title)}
      </div>
      <div className="text-slate-300 text-sm leading-relaxed mb-6 italic font-medium">
        “{safeStr(suggestion.body)}”
      </div>
      {suggestion.cta_label && (
        <button
          className="w-full py-4 bg-cyan-500 text-slate-950 font-black text-[10px] rounded-xl uppercase tracking-[0.2em] hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
          type="button"
          onClick={() => suggestion.cta_action && (window.location.href = suggestion.cta_action)}
        >
          {suggestion.cta_label}
        </button>
      )}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ stats, status, lastUpdated, error, source }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "curriculum">("overview");
  const [focusView, setFocusView] = useState<null | { type: "heatmap" | "sessions"; title: string }>(null);

  const statusConfig = {
    live: { label: "MISSION LIVE", pill: "live" as const },
    stale: { label: "LOCAL DATA", pill: "stale" as const },
    loading: { label: "SYNCING...", pill: "loading" as const },
    error: { label: "COMMS ERROR", pill: "error" as const },
    idle: { label: "STANDBY", pill: "stale" as const },
  }[status];

  if (!stats) {
    return (
      <div className="flex flex-col w-full h-full min-h-0 items-center justify-center p-8 text-center">
        <Activity className="text-cyan-500 animate-pulse" size={48} />
        <p className="mt-4 text-slate-500 font-black text-[10px] uppercase tracking-[0.3em]">
          {status === "error" ? "Sem dados disponíveis" : "Carregando Command Center..."}
        </p>
        {error ? <p className="text-[10px] text-rose-400 mt-3 break-words max-w-md">{error}</p> : null}
      </div>
    );
  }

  const rangeFrom = safeStr(stats?.range?.from);
  const rangeTo = safeStr(stats?.range?.to);
  const kpis = stats?.kpis;

  const daily = safeArr(stats?.daily);
  const sessionsSeries = daily.map((entry) => safeNum(entry?.sessions, 0));
  const scoreSeries = daily.map((entry) => safeNum(entry?.score_avg, 0));
  const combinedMax = Math.max(1, ...sessionsSeries, ...scoreSeries);

  const globalHeatmap = safeArr(stats?.global_heatmap);
  const globalHeatmapTop = safeArr(stats?.global_heatmap_top_notes);
  const { map: heatmapMap, octaves } = buildHeatmapGrid(globalHeatmap);
  const recentSessions = safeArr(stats?.recent_sessions);
  const chapters = safeArr(stats?.chapters);
  const errorPairs = safeArr(stats?.error_pairs);
  const suggestion = safeArr(stats?.suggestions)[0];

  const sourceLabel = safeStr(
    source === "static" ? "Fallback" : source === "cache" ? "Cache local" : "API",
    "API"
  );

  return (
    <div className="flex flex-col w-full h-full min-h-0 text-slate-200 overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{ x: [-20, 20, -20], y: [-20, 20, -20] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-0 left-0 w-[40%] h-[40%] bg-cyan-500/5 blur-[100px] rounded-full"
        />
        <motion.div
          animate={{ x: [20, -20, 20], y: [20, -20, 20] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-pink-500/5 blur-[100px] rounded-full"
        />
      </div>

      <header className="sticky top-0 z-50 bg-[#05060f]/80 backdrop-blur-xl border-b border-white/5 px-6 py-6 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <BarChart2 size={22} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-[0.4em]">
                COMMAND ANALYTICS <span className="text-slate-600 font-mono text-xs">v2.5</span>
              </h2>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                {rangeFrom} — {rangeTo}
              </div>
              <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                Fonte: {sourceLabel} · Atualizado: {formatTimestamp(lastUpdated)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex bg-slate-900/40 p-1.5 rounded-2xl border border-white/5">
              {[
                { id: "overview", label: "BRIEFING", icon: Layout },
                { id: "performance", label: "TÉCNICO", icon: Zap },
                { id: "curriculum", label: "PROGRESSO", icon: BookOpen },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                      ? "bg-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      : "text-slate-500 hover:text-white"
                    }`}
                >
                  <tab.icon size={12} /> <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
            <div className="hidden sm:flex flex-col items-end">
              <Pill tone={statusConfig.pill}>{statusConfig.label}</Pill>
              <div className="text-[8px] text-slate-700 font-black mt-1 uppercase tracking-widest">
                TRANSMISSÃO ORBITAL
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 z-10 min-h-0">
        <div className="max-w-7xl mx-auto space-y-8 pb-10">
          <AnimatePresence mode="wait">
            {activeTab === "overview" ? (
              <motion.div
                key="overview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                <Card title="Sumário de Operações" icon={<Target size={14} />} glow className="lg:col-span-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-12 py-4">
                    <Stat
                      label="Sessões (30d)"
                      value={fmt0(kpis?.sessions_30d)}
                      sub={`7 dias: ${fmt0(kpis?.sessions_7d)}`}
                    />
                    <Stat
                      label="Precisão Global"
                      value={isFiniteNumber(kpis?.accuracy_avg) ? `${fmt1(kpis?.accuracy_avg)}%` : "—"}
                      color="text-emerald-400"
                      sub="Média Ponderada"
                    />
                    <Stat
                      label="Latência Média"
                      value={isFiniteNumber(kpis?.latency_avg) ? `${fmt0(kpis?.latency_avg)}ms` : "—"}
                      color="text-pink-500"
                      sub="Tempo de Reação"
                    />
                    <Stat
                      label="Streak Atual"
                      value={isFiniteNumber(kpis?.best_streak) ? `${fmt0(kpis?.best_streak)}x` : "—"}
                      sub="Consistência Neural"
                    />
                    <Stat
                      label="Tempo Total"
                      value={formatDuration(safeNum(kpis?.practice_time_7d_sec, 0))}
                      sub="Treino Líquido"
                    />
                    <Stat
                      label="Best Score"
                      value={isFiniteNumber(kpis?.best_score) ? fmt1(kpis?.best_score) : "—"}
                      color="text-amber-400"
                      sub="Performance Peak"
                    />
                  </div>
                </Card>

                <div className="lg:col-span-4 flex flex-col gap-8">
                  <Card title="AI Intelligence" icon={<Brain size={14} />} className="flex-1">
                    <SuggestionCard suggestion={suggestion} />
                  </Card>
                  <Card title="Tendência Semanal" icon={<TrendingUp size={14} />}>
                    <div className="h-28 w-full relative">
                      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <polyline
                          points={buildLinePoints(scoreSeries, combinedMax)}
                          fill="none"
                          className="stroke-cyan-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {scoreSeries.length === 0 ? (
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">
                          Sem dados suficientes
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </div>

                <CollapsibleSection
                  title="Frequência de Engajamento"
                  icon={<History size={14} />}
                  defaultOpen
                  className="lg:col-span-12"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
                    <div className="lg:col-span-3 h-56 lg:h-64 relative bg-slate-900/20 rounded-2xl p-4 lg:p-6 border border-white/5">
                      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <path
                          d={`M 0 100 L ${buildLinePoints(sessionsSeries, combinedMax)} L 100 100 Z`}
                          className="fill-cyan-400/5"
                        />
                        <polyline
                          points={buildLinePoints(sessionsSeries, combinedMax)}
                          fill="none"
                          className="stroke-cyan-400"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <polyline
                          points={buildLinePoints(scoreSeries, combinedMax)}
                          fill="none"
                          className="stroke-pink-500"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray="1 3"
                        />
                      </svg>
                      {sessionsSeries.length === 0 && scoreSeries.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Nenhum dado diário
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-white/5">
                        <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Sessões Diárias
                        </span>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-2xl border border-white/5">
                        <div className="w-3 h-3 rounded-full bg-pink-500 shadow-[0_0_10px_#ec4899]" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Performance Score
                        </span>
                      </div>
                      <div className="p-4 border-l-2 border-emerald-500/30 bg-emerald-500/5 text-[10px] font-bold text-emerald-400/80 uppercase leading-relaxed tracking-wider">
                        SISTEMA OPERANDO EM CAPACIDADE OTIMIZADA. TENDÊNCIA DE CRESCIMENTO DE 14% NA PRECISÃO DE SALTO.
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              </motion.div>
            ) : null}

            {activeTab === "performance" ? (
              <motion.div
                key="performance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                <CollapsibleSection
                  title="Mapa Neural de Precisão (Preview)"
                  icon={<Zap size={14} />}
                  defaultOpen
                  action={
                    <button
                      type="button"
                      className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 hover:text-white"
                      onClick={() => setFocusView({ type: "heatmap", title: "Heatmap Completo" })}
                      disabled={!globalHeatmap.length}
                    >
                      Ver completo
                    </button>
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest">
                        Top notas críticas
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {globalHeatmapTop.slice(0, 6).map((note) => (
                          <div
                            key={note.midi}
                            className="bg-slate-950 p-3 rounded-xl border border-white/5 flex flex-col items-center"
                          >
                            <span className="text-[11px] font-black text-cyan-400 mb-1">{midiToNote(note.midi)}</span>
                            <span className="text-[10px] text-rose-500 font-bold">{fmt0(note.error_rate)}%</span>
                          </div>
                        ))}
                        {!globalHeatmapTop.length ? (
                          <div className="col-span-full text-[10px] text-slate-600 font-bold uppercase">Sem dados do heatmap.</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4">
                      <div className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">
                        Insight rápido
                      </div>
                      <div className="text-sm text-slate-300">
                        Foque nas notas com maior taxa de erro e repita exercícios curtos antes de sessões completas.
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>

                <Card title="Detecção de Instabilidade" icon={<Brain size={14} />}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                    <div className="min-h-0">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-widest border-b border-white/5 pb-2">
                        Pares de Erro
                      </h4>
                      <div className="space-y-3">
                        {errorPairs.slice(0, 5).map((pair: StatsErrorPair, idx: number) => (
                          <div
                            key={`${pair.expected_pitch}-${pair.played_pitch}-${idx}`}
                            className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-black text-slate-400">{midiToNote(pair.expected_pitch)}</span>
                              <ArrowRight size={12} className="text-pink-500" />
                              <span className="text-[11px] font-black text-white">{midiToNote(pair.played_pitch)}</span>
                            </div>
                            <span className="text-[10px] font-black text-slate-600 uppercase">{fmt0(pair.count)}x</span>
                          </div>
                        ))}
                        {!errorPairs.length ? (
                          <div className="text-[10px] text-slate-600 font-bold uppercase">Sem pares de erro ainda.</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-h-0">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-widest border-b border-white/5 pb-2">
                        Notas Críticas
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        {globalHeatmapTop.slice(0, 9).map((note: StatsHeatmapNote) => (
                          <div
                            key={note.midi}
                            className="bg-slate-950 p-3 rounded-xl border border-white/5 flex flex-col items-center"
                          >
                            <span className="text-[11px] font-black text-cyan-400 mb-1">{midiToNote(note.midi)}</span>
                            <span className="text-[10px] text-rose-500 font-bold">{fmt0(note.error_rate)}%</span>
                          </div>
                        ))}
                        {!globalHeatmapTop.length ? (
                          <div className="col-span-3 text-[10px] text-slate-600 font-bold uppercase">Sem notas críticas.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>

                <CollapsibleSection
                  title="Histórico de Sessões (Preview)"
                  icon={<History size={14} />}
                  action={
                    <button
                      type="button"
                      className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 hover:text-white"
                      onClick={() => setFocusView({ type: "sessions", title: "Sessões completas" })}
                      disabled={!recentSessions.length}
                    >
                      Ver completo
                    </button>
                  }
                >
                  <div className="overflow-x-auto custom-scrollbar max-h-80">
                    <table className="w-full text-left border-separate border-spacing-y-3 min-w-[620px]">
                      <thead>
                        <tr>
                          <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Módulo</th>
                          <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Data/Hora</th>
                          <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Performance</th>
                          <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Latência</th>
                          <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Duração</th>
                          <th className="px-4 text-right" />
                        </tr>
                      </thead>
                      <tbody>
                        {recentSessions.slice(0, 5).map((session) => (
                          <tr
                            key={session.session_id}
                            className="bg-white/[0.03] hover:bg-white/[0.08] transition-colors rounded-2xl"
                          >
                            <td className="px-4 py-4 first:rounded-l-2xl border-l border-cyan-500/20">
                              <div className="text-sm font-black text-white uppercase tracking-tight">
                                Capítulo {fmt0(session.chapter_id)}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold">LIÇÃO {safeStr(session.lesson_id, "—")}</div>
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-slate-400">
                              {safeDateLabel(session.completed_at)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2 flex-wrap">
                                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-lg">
                                  {fmt0(session.hits)} HIT
                                </span>
                                <span className="bg-rose-500/10 text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-lg">
                                  {fmt0(session.misses)} MISS
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-xs font-black text-white">
                              {isFiniteNumber(session.latency_avg_ms) ? `${fmt0(session.latency_avg_ms)}ms` : "—"}
                            </td>
                            <td className="px-4 py-4 text-xs font-black text-cyan-300">
                              {isFiniteNumber(session.duration_sec) && session.duration_sec > 0
                                ? formatDuration(session.duration_sec)
                                : "—"}
                            </td>
                            <td className="px-4 py-4 text-right last:rounded-r-2xl border-r border-cyan-500/20">
                              <button
                                type="button"
                                className="text-[10px] font-black text-cyan-400 uppercase tracking-widest hover:text-white transition-colors"
                              >
                                Sincronizar
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!recentSessions.length ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-[10px] text-slate-600 font-bold uppercase">
                              Sem sessões recentes.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>
              </motion.div>
            ) : null}

            {activeTab === "curriculum" ? (
              <motion.div
                key="curriculum"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {chapters.map((chapter) => {
                  const progress = clamp(safeNum(chapter.progress_pct, 0), 0, 100);
                  const notes = safeArr(chapter.heatmap_top_notes);
                  return (
                    <Card
                      key={chapter.chapter_id}
                      title={safeStr(chapter.title, "Capítulo")}
                      glow={!!chapter.unlocked}
                      className={!chapter.unlocked ? "opacity-50 pointer-events-none" : ""}
                      right={
                        <div className="text-[10px] font-black text-cyan-400 tracking-widest">
                          {chapter.unlocked ? "SISTEMA ATIVO" : "BLOQUEADO"}
                        </div>
                      }
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase font-black mb-1">Domínio Acadêmico</div>
                          <div className="text-4xl font-black text-white tracking-tighter">{fmt0(progress)}%</div>
                        </div>
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl border border-white/5 flex items-center justify-center text-cyan-400/50">
                          <BookOpen size={20} />
                        </div>
                      </div>

                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mb-8">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 1.2, delay: 0.1 }}
                          className="h-full bg-gradient-to-r from-cyan-400 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                          <div className="text-[9px] text-slate-600 uppercase font-black mb-1">Sessões</div>
                          <div className="text-xs font-bold text-white tracking-widest">{fmt0(chapter.sessions_total)}</div>
                        </div>
                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                          <div className="text-[9px] text-slate-600 uppercase font-black mb-1">Tempo Médio</div>
                          <div className="text-xs font-bold text-white tracking-widest">
                            {chapter.sessions_total > 0
                              ? formatDuration(safeNum(chapter.practice_time_sec, 0) / chapter.sessions_total)
                              : "—"}
                          </div>
                        </div>
                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                          <div className="text-[9px] text-slate-600 uppercase font-black mb-1">Último Acesso</div>
                          <div className="text-xs font-bold text-white tracking-widest">
                            {chapter.last_session_at ? safeDateLabel(chapter.last_session_at) : "—"}
                          </div>
                        </div>
                      </div>

                      {notes.length ? (
                        <div className="pt-6 border-t border-white/5">
                          <div className="text-[9px] font-black text-slate-600 uppercase mb-4 tracking-widest flex items-center gap-2">
                            <Target size={12} /> Notas Mais Instáveis
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {notes.slice(0, 4).map((note) => (
                              <div
                                key={note.midi}
                                className="px-3 py-1.5 bg-rose-500/10 text-rose-500 text-[10px] font-black rounded-lg border border-rose-500/20"
                              >
                                {midiToNote(note.midi)} {fmt0(note.error_rate)}%
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-600 font-bold uppercase">Nenhuma nota crítica.</div>
                      )}
                    </Card>
                  );
                })}
                {!chapters.length ? (
                  <div className="text-[10px] text-slate-600 font-bold uppercase col-span-full text-center">
                    Nenhum capítulo disponível.
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>

      <footer className="h-10 shrink-0 bg-[#05060f] border-t border-white/5 flex items-center justify-between px-10 pointer-events-none">
        <div className="text-[9px] font-black text-slate-700 uppercase tracking-[0.5em] flex items-center gap-6">
          <span>ENGENHO DE ANÁLISE ATIVO</span>
          <span className="w-1.5 h-1.5 bg-cyan-500/20 rounded-full" />
          <span>SISTEMA DE PRECISÃO REDE GEMINI</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Clock size={10} className="text-slate-800" />
            <span className="text-[9px] font-black text-slate-800 uppercase tracking-widest">REAL-TIME SYNC</span>
          </div>
          <div className="flex items-center gap-2">
            <Award size={10} className="text-slate-800" />
            <span className="text-[9px] font-black text-slate-800 uppercase tracking-widest">MASTER LVL 12</span>
          </div>
        </div>
      </footer>

      <FocusPanel
        open={!!focusView}
        title={focusView?.title ?? ""}
        onClose={() => setFocusView(null)}
      >
        {focusView?.type === "heatmap" ? (
          <div className="space-y-4">
            <div className="overflow-x-auto pb-6 custom-scrollbar">
              <div className="min-w-[640px] space-y-2">
                <div className="flex mb-4">
                  <div className="w-12" />
                  {NOTE_NAMES.map((n) => (
                    <div key={n} className="flex-1 text-[9px] font-black text-slate-600 text-center uppercase">
                      {n}
                    </div>
                  ))}
                </div>
                {octaves.map((oct) => (
                  <div key={oct} className="flex gap-2">
                    <div className="w-12 text-[10px] font-black text-slate-500 flex items-center">OIT {oct}</div>
                    {NOTE_NAMES.map((_, i) => {
                      const midi = (oct + 1) * 12 + i;
                      const noteData = heatmapMap.get(midi);
                      const rate = safeNum(noteData?.error_rate, 0);
                      const intensity = clamp(rate / 40, 0, 1);
                      return (
                        <div
                          key={midi}
                          className="flex-1 aspect-square rounded-md transition-all duration-300 hover:scale-110 cursor-help"
                          style={{
                            backgroundColor:
                              rate > 0 ? `rgba(236, 72, 153, ${0.2 + intensity * 0.8})` : "rgba(255, 255, 255, 0.03)",
                            boxShadow: rate > 10 ? `0 0 15px rgba(236, 72, 153, ${intensity * 0.4})` : "none",
                          }}
                          title={`${midiToNote(midi)}: ${fmt1(rate)}% erro`}
                        />
                      );
                    })}
                  </div>
                ))}
                {!octaves.length ? (
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-4">
                    Heatmap indisponível
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {focusView?.type === "sessions" ? (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-y-3 min-w-[700px]">
              <thead>
                <tr>
                  <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Módulo</th>
                  <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Data/Hora</th>
                  <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Performance</th>
                  <th className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest pb-2">Latência</th>
                  <th className="px-4 text-right" />
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => (
                  <tr
                    key={session.session_id}
                    className="bg-white/[0.03] hover:bg-white/[0.08] transition-colors rounded-2xl"
                  >
                    <td className="px-4 py-4 first:rounded-l-2xl border-l border-cyan-500/20">
                      <div className="text-sm font-black text-white uppercase tracking-tight">
                        Capítulo {fmt0(session.chapter_id)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold">LIÇÃO {safeStr(session.lesson_id, "—")}</div>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold text-slate-400">
                      {safeDateLabel(session.completed_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2 flex-wrap">
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-lg">
                          {fmt0(session.hits)} HIT
                        </span>
                        <span className="bg-rose-500/10 text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-lg">
                          {fmt0(session.misses)} MISS
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-black text-white">
                      {isFiniteNumber(session.latency_avg_ms) ? `${fmt0(session.latency_avg_ms)}ms` : "—"}
                    </td>
                    <td className="px-4 py-4 text-right last:rounded-r-2xl border-r border-cyan-500/20">
                      <button
                        type="button"
                        className="text-[10px] font-black text-cyan-400 uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Sincronizar
                      </button>
                    </td>
                  </tr>
                ))}
                {!recentSessions.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[10px] text-slate-600 font-bold uppercase">
                      Sem sessões recentes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </FocusPanel>
    </div>
  );
};

export default Dashboard;
