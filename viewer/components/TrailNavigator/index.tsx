import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, Lock, CheckCircle, Star } from 'lucide-react';
import type { Trail, TrailLevel, TrailModule, TrailChapter, HandAssignment } from '../../catalog/types';

// ---------------------------------------------------------------------------
// Analytics stub — replace with real analytics client when available
// ---------------------------------------------------------------------------
function logEvent(name: string, props?: Record<string, unknown>): void {
  console.debug('[TrailNavigator:analytics]', name, props ?? '');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterStats {
  chapter_id: number | string;
  unlocked: boolean;
  progress_pct: number; // 0-100
}

interface Props {
  trails: Trail[];
  /** Optional per-chapter stats for lock/complete indicators */
  stats?: ChapterStats[];
  onSelectChapter: (chapterId: number) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HAND_LABELS: Record<HandAssignment, string> = {
  right: 'Mão Direita',
  left: 'Mão Esquerda',
  both: 'Duas Mãos',
  alternate: 'Mãos Alternadas',
};

const HAND_COLORS: Record<HandAssignment, string> = {
  right: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
  left: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  both: 'text-violet-400 border-violet-400/30 bg-violet-400/10',
  alternate: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
};

function buildStatsIndex(stats?: ChapterStats[]): Map<number, ChapterStats> {
  const map = new Map<number, ChapterStats>();
  for (const s of stats ?? []) {
    const id = typeof s.chapter_id === 'string' ? parseInt(s.chapter_id, 10) : s.chapter_id;
    if (!isNaN(id)) map.set(id, s);
  }
  return map;
}

function getRecommendedChapter(
  trails: Trail[],
  statsIndex: Map<number, ChapterStats>,
): TrailChapter | null {
  for (const trail of trails) {
    for (const level of trail.levels ?? []) {
      for (const mod of level.modules ?? []) {
        for (const ch of mod.chapters ?? []) {
          if (ch.coming_soon) continue;
          const s = statsIndex.get(ch.chapter_id);
          if (!s) return ch; // never started — recommend first unstated
          if (s.unlocked && s.progress_pct < 100) return ch;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HandBadge({ hand }: { hand: HandAssignment }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${HAND_COLORS[hand]}`}>
      {HAND_LABELS[hand]}
    </span>
  );
}

function ChapterCard({
  chapter,
  moduleHand,
  stats,
  onSelect,
}: {
  chapter: TrailChapter;
  moduleHand?: HandAssignment;
  stats?: ChapterStats;
  onSelect: (id: number) => void;
}) {
  const isComplete = (stats?.progress_pct ?? 0) >= 100;
  const isLocked = stats ? !stats.unlocked : false;
  const isSoon = !!chapter.coming_soon;

  const disabled = isLocked || isSoon;

  let statusClass = 'chapter-card';
  if (isSoon || isLocked) statusClass += ' is-locked';
  if (isComplete) statusClass += ' is-complete';

  function handleClick() {
    if (disabled) return;
    logEvent('chapter_selected', {
      chapter_id: chapter.chapter_id,
      title: chapter.title,
    });
    onSelect(chapter.chapter_id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !disabled) handleClick();
  }

  return (
    <button
      className={statusClass}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-disabled={disabled}
      style={{ width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <div className="chapter-card-header">
        <div style={{ flex: 1 }}>
          <div className="chapter-card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {chapter.title}
            {chapter.badge && (
              <span style={{
                fontSize: '10px',
                fontWeight: 'bold',
                color: '#f59e0b',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '4px',
                padding: '1px 5px',
              }}>
                {chapter.badge}
              </span>
            )}
          </div>
          {chapter.description && (
            <div className="chapter-subtitle" style={{ marginTop: '2px' }}>{chapter.description}</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {isSoon && (
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Em breve
            </span>
          )}
          {isLocked && !isSoon && <Lock size={14} style={{ color: '#475569' }} />}
          {isComplete && !isLocked && (
            <CheckCircle size={14} style={{ color: '#00ff88' }} />
          )}
          {chapter.allowed_notes.length > 0 && (
            <span style={{ fontSize: '10px', color: '#475569' }}>
              {chapter.allowed_notes.length} nota{chapter.allowed_notes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {stats && stats.progress_pct > 0 && (
        <div style={{ marginTop: '8px', height: '2px', background: '#1e293b', borderRadius: '1px' }}>
          <div style={{
            width: `${stats.progress_pct}%`,
            height: '100%',
            background: isComplete ? '#00ff88' : '#00f2ff',
            borderRadius: '1px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}
    </button>
  );
}

function ModuleAccordion({
  mod,
  statsIndex,
  onSelect,
}: {
  mod: TrailModule;
  statsIndex: Map<number, ChapterStats>;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const visibleChapters = mod.chapters ?? [];

  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) logEvent('track_expanded', { module_id: mod.module_id });
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(0,242,255,0.04)',
          border: '1px solid rgba(0,242,255,0.1)',
          borderRadius: '10px',
          cursor: 'pointer',
          marginBottom: open ? '8px' : 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <span style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '13px' }}>{mod.title}</span>
          {mod.subtitle && (
            <span style={{ color: '#64748b', fontSize: '11px' }}>{mod.subtitle}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {mod.hand && <HandBadge hand={mod.hand} />}
          <ChevronDown
            size={16}
            style={{
              color: '#64748b',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="chapter-overlay-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {visibleChapters.map(ch => (
                <ChapterCard
                  key={ch.chapter_id}
                  chapter={ch}
                  moduleHand={mod.hand}
                  stats={statsIndex.get(ch.chapter_id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecommendedCard({
  chapter,
  hasProgress,
  onSelect,
}: {
  chapter: TrailChapter;
  hasProgress: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginBottom: '20px',
        padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(0,242,255,0.08) 0%, rgba(0,242,255,0.02) 100%)',
        border: '1px solid rgba(0,242,255,0.25)',
        borderRadius: '12px',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(chapter.chapter_id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Star size={16} style={{ color: '#00f2ff', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#00f2ff', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
            {hasProgress ? '▶ Continue de onde parou' : 'Comece aqui — é o lugar certo para você!'}
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: '600', fontSize: '14px' }}>
            {chapter.title}
          </div>
          {chapter.description && (
            <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{chapter.description}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TrailNavigator({ trails, stats, onSelectChapter, onClose }: Props) {
  const statsIndex = useMemo(() => buildStatsIndex(stats), [stats]);
  const trail = trails[0] ?? null;
  const levels = trail?.levels ?? [];

  const firstLevelId = levels[0]?.level_id ?? '';
  const [activeLevelId, setActiveLevelId] = useState(firstLevelId);

  const activeLevel: TrailLevel | undefined = useMemo(
    () => levels.find(l => l.level_id === activeLevelId) ?? levels[0],
    [levels, activeLevelId],
  );

  const recommended = useMemo(
    () => getRecommendedChapter(trails, statsIndex),
    [trails, statsIndex],
  );

  const recommendedHasProgress = useMemo(() => {
    if (!recommended) return false;
    return (statsIndex.get(recommended.chapter_id)?.progress_pct ?? 0) > 0;
  }, [recommended, statsIndex]);

  // Close on Escape
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEvent('catalog_opened', { trail_id: trail?.trail_id });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        logEvent('selector_closed_without_selection');
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, trail?.trail_id]);

  function handleSelectChapter(id: number) {
    onSelectChapter(id);
    onClose();
  }

  if (!trail) {
    return (
      <div className="chapter-overlay is-open">
        <div className="chapter-overlay-backdrop" onClick={() => { logEvent('selector_closed_without_selection'); onClose(); }} />
        <div className="chapter-overlay-panel" ref={panelRef}>
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Nenhuma trilha encontrada.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chapter-overlay is-open" role="dialog" aria-modal="true" aria-label={trail.title}>
      {/* Backdrop */}
      <div
        className="chapter-overlay-backdrop"
        onClick={() => { logEvent('selector_closed_without_selection'); onClose(); }}
      />

      {/* Panel */}
      <motion.div
        className="chapter-overlay-panel"
        ref={panelRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        {/* Header */}
        <div className="chapter-overlay-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>
              {trail.title}
            </h2>
            {trail.subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{trail.subtitle}</p>
            )}
          </div>
          <button
            className="chapter-secondary-btn"
            onClick={() => { logEvent('selector_closed_without_selection'); onClose(); }}
            aria-label="Fechar"
            style={{ padding: '8px', lineHeight: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Level tabs */}
        {levels.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', padding: '0 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {levels.map(lvl => (
              <button
                key={lvl.level_id}
                onClick={() => setActiveLevelId(lvl.level_id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '700',
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  borderColor: lvl.level_id === activeLevelId ? 'rgba(0,242,255,0.4)' : 'rgba(255,255,255,0.08)',
                  background: lvl.level_id === activeLevelId ? 'rgba(0,242,255,0.1)' : 'transparent',
                  color: lvl.level_id === activeLevelId ? '#00f2ff' : '#64748b',
                }}
              >
                {lvl.title}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="chapter-overlay-content" style={{ padding: '20px' }}>
          {/* Recommended card */}
          {recommended && (
            <RecommendedCard
              chapter={recommended}
              hasProgress={recommendedHasProgress}
              onSelect={handleSelectChapter}
            />
          )}

          {/* Modules */}
          {(activeLevel?.modules ?? []).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: '40px 0', fontSize: '14px' }}>
              Nenhum conteúdo disponível neste nível ainda.
            </div>
          ) : (
            (activeLevel?.modules ?? []).map(mod => (
              <ModuleAccordion
                key={mod.module_id}
                mod={mod}
                statsIndex={statsIndex}
                onSelect={handleSelectChapter}
              />
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default TrailNavigator;
