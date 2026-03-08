import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Trail, TrailChapter, TrailModule, TrailLevel, HandAssignment } from '../catalog/types';

/* ── Stat stub (future: wire to real progress service) ── */
interface ChapterStats {
  unlocked: boolean;
  progress_pct: number;
}

type StatsIndex = Map<number, ChapterStats>;

/* ── Helpers ── */
function HandBadge({ hand }: { hand: HandAssignment }) {
  const label: Record<HandAssignment, string> = {
    right: '🤚 Direita',
    left: '🤚 Esquerda',
    both: '🙌 Ambas',
    alternate: '🔄 Alternada',
  };
  return (
    <span
      style={{
        fontSize: '10px',
        padding: '2px 7px',
        borderRadius: '6px',
        background: 'rgba(0,242,255,0.08)',
        border: '1px solid rgba(0,242,255,0.2)',
        color: '#67e8f9',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label[hand] ?? hand}
    </span>
  );
}

/* ── ChapterCard ── */
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

  const handleClick = () => {
    if (!disabled) onSelect(chapter.chapter_id);
  };

  const hand = chapter.hand ?? moduleHand;

  return (
    <button
      className={statusClass}
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{ width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <div className="chapter-card-header">
        <div style={{ flex: 1 }}>
          <div className="chapter-card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h3>{chapter.title || `Capítulo ${chapter.chapter_id}`}</h3>
            {chapter.badge && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: '#f59e0b',
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                }}
              >
                {chapter.badge}
              </span>
            )}
          </div>
          {chapter.description && (
            <p className="chapter-subtitle" style={{ marginTop: '2px' }}>
              {chapter.description}
            </p>
          )}
        </div>
        <div className="chapter-card-badges">
          {hand && <HandBadge hand={hand} />}
          {isSoon && (
            <span className="status-pill status-muted" style={{ fontSize: '10px' }}>
              Em breve
            </span>
          )}
          {isLocked && !isSoon && (
            <span className="status-pill status-miss" style={{ fontSize: '10px' }}>
              Bloqueado
            </span>
          )}
          {isComplete && !isLocked && (
            <span className="status-pill status-hit" style={{ fontSize: '10px' }}>
              ✓ Completo
            </span>
          )}
          {chapter.allowed_notes && chapter.allowed_notes.length > 0 && (
            <span style={{ fontSize: '10px', color: '#475569' }}>
              {chapter.allowed_notes.length} nota{chapter.allowed_notes.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {stats && stats.progress_pct > 0 && (
        <div className="progress-track" style={{ marginTop: '8px', height: '3px' }}>
          <div
            className="progress-bar"
            style={{
              width: `${Math.min(stats.progress_pct, 100)}%`,
              background: isComplete ? 'var(--success-neon)' : 'var(--primary-neon)',
            }}
          />
        </div>
      )}
    </button>
  );
}

/* ── ModuleAccordion ── */
function ModuleAccordion({
  mod,
  statsIndex,
  onSelect,
}: {
  mod: TrailModule;
  statsIndex: StatsIndex;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const visibleChapters = mod.chapters ?? [];

  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
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
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>
            {mod.title}
          </span>
          {mod.subtitle && (
            <span style={{ color: '#64748b', fontSize: '11px' }}>{mod.subtitle}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {mod.hand && <HandBadge hand={mod.hand} />}
          <span
            style={{
              color: '#64748b',
              fontSize: '14px',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
            }}
          >
            ▼
          </span>
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
            <div
              className="chapter-overlay-list"
              style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}
            >
              {visibleChapters.map((ch) => (
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

/* ── RecommendedCard ── */
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
        <span style={{ fontSize: '16px', flexShrink: 0 }}>⭐</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '10px',
              color: '#00f2ff',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            {hasProgress ? '▶ Continue de onde parou' : 'Comece aqui — é o lugar certo para você!'}
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '14px' }}>
            {chapter.title}
          </div>
          {chapter.description && (
            <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
              {chapter.description}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main: TrailNavigator ── */
interface TrailNavigatorProps {
  trails: Trail[];
  onSelectChapter: (chapterId: number, lessonId?: string) => void;
  onClose: () => void;
}

export const TrailNavigator: React.FC<TrailNavigatorProps> = ({
  trails,
  onSelectChapter,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Pick first trail (single-trail mode for now)
  const trail = trails[0];
  const levels = trail?.levels ?? [];

  const [activeLevelId, setActiveLevelId] = useState<string | number | undefined>(
    levels[0]?.level_id
  );

  const activeLevel = levels.find((l) => l.level_id === activeLevelId) ?? levels[0];

  // Stats stub — empty for now, will be wired to progress service
  const statsIndex: StatsIndex = new Map();

  // Find recommended chapter (first non-coming-soon chapter)
  const allChapters =
    activeLevel?.modules?.flatMap((m) => m.chapters ?? []) ?? [];
  const recommended = allChapters.find((ch) => !ch.coming_soon);

  const handleSelectChapter = (chapterId: number, lessonId?: string) => {
    onSelectChapter(chapterId, lessonId);
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!trail || trails.length === 0) {
    return (
      <div className="chapter-overlay is-open" role="dialog" aria-modal="true">
        <div className="chapter-overlay-backdrop" onClick={onClose} />
        <div className="chapter-overlay-panel">
          <div className="chapter-overlay-content">
            <div className="chapter-overlay-state">
              <p>Carregando catálogo...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chapter-overlay is-open" role="dialog" aria-modal="true" aria-label={trail.title}>
      <div className="chapter-overlay-backdrop" onClick={onClose} />
      <motion.div
        className="chapter-overlay-panel"
        ref={panelRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Header */}
        <div className="chapter-overlay-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
              {trail.title}
            </h2>
            {trail.subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                {trail.subtitle}
              </p>
            )}
          </div>
          <button
            className="chapter-secondary-btn"
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}
          >
            ✕
          </button>
        </div>

        {/* Level tabs */}
        {levels.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              padding: '0 20px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {levels.map((lvl) => (
              <button
                key={lvl.level_id}
                onClick={() => setActiveLevelId(lvl.level_id)}
                type="button"
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: '1px solid',
                  borderColor:
                    lvl.level_id === activeLevelId
                      ? 'rgba(0,242,255,0.4)'
                      : 'rgba(255,255,255,0.08)',
                  background:
                    lvl.level_id === activeLevelId
                      ? 'rgba(0,242,255,0.1)'
                      : 'transparent',
                  color:
                    lvl.level_id === activeLevelId ? '#00f2ff' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {lvl.title}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="chapter-overlay-content" style={{ padding: '20px' }}>
          {recommended && (
            <RecommendedCard
              chapter={recommended}
              hasProgress={false}
              onSelect={handleSelectChapter}
            />
          )}

          {(activeLevel?.modules ?? []).length === 0 ? (
            <div className="chapter-overlay-state">
              <p>Nenhum conteúdo disponível neste nível ainda.</p>
            </div>
          ) : (
            (activeLevel?.modules ?? []).map((mod) => (
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
};
