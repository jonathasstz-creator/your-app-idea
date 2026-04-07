import React from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useUserContext } from '../contexts/UserContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { useLessons } from '../hooks/useLessons';
import { Music, Flame, Trophy, Clock, Target, Zap, TrendingUp, AlertCircle } from 'lucide-react';

const DashboardPage: React.FC = () => {
  const { profile } = useUserContext();
  const { data: analytics, loading: analyticsLoading } = useAnalytics();
  const { trails, loading: lessonsLoading } = useLessons();

  const allChapters = trails.flatMap(
    (t) => t.levels?.flatMap((l) => l.modules?.flatMap((m) => m.chapters ?? []) ?? []) ?? []
  );

  // Derive stats
  const practiceHours = profile?.total_practice_hours ?? 0;
  const practiceSeconds = Math.round(practiceHours * 3600);
  const practiceMinutes = Math.round(practiceHours * 60);

  const todayActivity = analytics?.daily?.[0];
  const todaySeconds = (todayActivity?.practice_minutes ?? 0) * 60;
  const todayNotes = todayActivity?.notes_played ?? 0;

  const weekSeconds = (analytics?.daily ?? [])
    .slice(0, 7)
    .reduce((sum, d) => sum + d.practice_minutes * 60, 0);

  const latestAccuracy = analytics?.progress?.accuracy_trend?.[0]?.value;
  const accuracyPct = latestAccuracy != null ? Math.round(latestAccuracy * 100) : null;

  const latestScore = analytics?.progress?.score_trend?.[0]?.value;

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6 max-w-5xl">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-bold">
              Olá, {profile?.name ?? 'musicista'} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Aqui está seu resumo de prática em tempo real.
            </p>
          </div>

          {/* Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<Clock className="w-4 h-4" />}
              label="Hoje"
              value={formatDuration(todaySeconds)}
              sub={`${todayNotes} notas`}
              accent="text-cyan-400"
            />
            <KpiCard
              icon={<Zap className="w-4 h-4" />}
              label="Semana"
              value={formatDuration(weekSeconds)}
              sub="últimos 7 dias"
              accent="text-yellow-400"
            />
            <KpiCard
              icon={<Flame className="w-4 h-4" />}
              label="Streak"
              value={`${profile?.current_streak ?? 0}`}
              sub={`recorde: ${profile?.longest_streak ?? 0} dias`}
              accent="text-orange-400"
            />
            <KpiCard
              icon={<Trophy className="w-4 h-4" />}
              label="Lições"
              value={`${profile?.lessons_completed ?? 0}`}
              sub="completas"
              accent="text-emerald-400"
            />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard
              icon={<Target className="w-4 h-4 text-violet-400" />}
              label="Precisão"
              value={accuracyPct != null ? `${accuracyPct}%` : '—'}
              loading={analyticsLoading}
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
              label="Score atual"
              value={latestScore != null ? Math.round(latestScore).toLocaleString() : '—'}
              loading={analyticsLoading}
            />
            <MetricCard
              icon={<Music className="w-4 h-4 text-pink-400" />}
              label="Tempo total"
              value={formatDuration(practiceSeconds)}
              loading={!profile}
            />
          </div>

          {/* Difficult notes */}
          {analytics?.difficult_notes && analytics.difficult_notes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Notas para praticar
              </h2>
              <div className="flex gap-2">
                {analytics.difficult_notes.map((n) => (
                  <div
                    key={n.note}
                    className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm"
                  >
                    <span className="font-mono font-bold text-red-400">{n.note}</span>
                    <span className="text-slate-500 ml-2">{Math.round(n.miss_rate * 100)}% erro</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recommended chapters */}
          {allChapters.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Recomendadas
              </h2>
              <div className="grid md:grid-cols-2 gap-3">
                {allChapters.slice(0, 4).map((ch) => (
                  <div
                    key={ch.chapter_id}
                    className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-slate-600 transition-colors cursor-pointer"
                  >
                    <p className="font-medium">{ch.title ?? `Cap. ${ch.chapter_id}`}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {[ch.hand, ch.difficulty].filter(Boolean).join(' · ') || 'Prática'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Time by module */}
          {analytics?.progress?.time_by_module && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Tempo por módulo
              </h2>
              <div className="space-y-1.5">
                {analytics.progress.time_by_module.map((m) => {
                  const maxMin = Math.max(...analytics.progress.time_by_module.map((x) => x.minutes));
                  const pct = maxMin > 0 ? (m.minutes / maxMin) * 100 : 0;
                  return (
                    <div key={m.module} className="flex items-center gap-3 text-sm">
                      <span className="w-28 text-slate-400 truncate">{m.module}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-20 text-right">
                        {formatDuration(m.minutes * 60)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

/* ── Helpers ─────────────────────────────── */

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ── Sub-components ──────────────────────── */

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}> = ({ icon, label, value, sub, accent }) => (
  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/40">
    <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wider mb-2 ${accent}`}>
      {icon} {label}
    </div>
    <p className="text-2xl font-bold tabular-nums">{value}</p>
    <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
  </div>
);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
}> = ({ icon, label, value, loading }) => (
  <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 flex items-center gap-3">
    {icon}
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums">
        {loading ? <span className="animate-pulse text-slate-600">···</span> : value}
      </p>
    </div>
  </div>
);

export default DashboardPage;
