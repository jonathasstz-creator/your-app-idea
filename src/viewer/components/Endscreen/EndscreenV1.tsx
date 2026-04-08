/**
 * ENDSCREEN V1 - MONOFÔNICO v1.2
 * Arquivo: viewer/components/Endscreen/EndscreenV1.tsx
 *
 * v1.2: UX clarity rewrite
 * - Score explained visually (X notas × 100 pts)
 * - "Respostas Corretas" → "Notas Acertadas"
 * - "Acurácia" → "Aproveitamento"
 * - "Tempo Médio" → "Tempo médio por nota"
 * - perNote stats: clarified as "tentativas" (includes retries)
 * - Layout: score integrated into summary, not isolated box
 *
 * 🔒 ZERO QUEBRAS: overlay isolado, sem alterar áudio/timing
 */

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TaskResultSummaryV1 } from "../../types/task";
import "./endscreen.css";

interface EndscreenV1Props {
  result: TaskResultSummaryV1;
  onClose: () => void;
  onRepeat: () => void;
  onBack: () => void;
}

// ============================================================
// SUB-COMPONENTE: Partículas de celebração (CSS puro)
// ============================================================
const RecordParticles: React.FC = () => {
  const particles = useMemo(() => {
    const colors = ["#fbbf24", "var(--primary-neon)", "var(--success-neon)", "#f87171", "#c084fc"];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      tx: `${(Math.random() - 0.5) * 140}px`,
      ty: `${-(Math.random() * 90 + 30)}px`,
      color: colors[i % colors.length],
      delay: `${(Math.random() * 0.4).toFixed(2)}s`,
      size: `${Math.round(Math.random() * 6 + 5)}px`,
      rotate: `${Math.round(Math.random() * 360)}deg`,
    }));
  }, []);

  return (
    <div className="pb-particles" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="pb-particle"
          style={{
            "--tx": p.tx,
            "--ty": p.ty,
            "--color": p.color,
            "--delay": p.delay,
            "--size": p.size,
            "--rotate": p.rotate,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

// ============================================================
// SUB-COMPONENTE: Banner de novo recorde
// ============================================================
interface RecordBannerProps {
  isNewScoreRecord: boolean;
  isNewTimeRecord: boolean;
  isNewResponseRecord: boolean;
  scoreDelta?: number;
  timeSavedMs?: number;
  responseTimeSavedMs?: number;
}

const RecordBanner: React.FC<RecordBannerProps> = ({
  isNewScoreRecord,
  isNewTimeRecord,
  isNewResponseRecord,
  scoreDelta,
  timeSavedMs,
  responseTimeSavedMs,
}) => {
  const anyRecord = isNewScoreRecord || isNewTimeRecord || isNewResponseRecord;
  if (!anyRecord) return null;

  const formatSaved = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s mais rápido`;
    return `${ms}ms mais rápido`;
  };

  const allThree = isNewScoreRecord && isNewTimeRecord && isNewResponseRecord;
  const two = [isNewScoreRecord, isNewTimeRecord, isNewResponseRecord].filter(Boolean).length === 2;

  let icon = "🏆";
  let title = "NOVO RECORDE!";
  let subtitle = "";

  if (allThree) {
    icon = "🏆⚡⏱️";
    title = "TRIPLO RECORDE!";
    subtitle = "Pontuação, tempo e reflexo!";
  } else if (two) {
    const parts: string[] = [];
    if (isNewScoreRecord) parts.push("Pontuação");
    if (isNewTimeRecord) parts.push("Tempo");
    if (isNewResponseRecord) parts.push("Reflexo");
    icon = isNewScoreRecord ? "🏆⚡" : "⚡⏱️";
    title = "DUPLO RECORDE!";
    subtitle = parts.join(" e ");
  } else if (isNewScoreRecord) {
    subtitle = scoreDelta ? `+${scoreDelta} pts acima do seu recorde` : "";
  } else if (isNewTimeRecord) {
    icon = "⚡";
    title = "RECORDE DE TEMPO!";
    subtitle = timeSavedMs ? formatSaved(timeSavedMs) : "";
  } else if (isNewResponseRecord) {
    icon = "⏱️";
    title = "REFLEXO RECORDE!";
    subtitle = responseTimeSavedMs ? formatSaved(responseTimeSavedMs) : "";
  }

  return (
    <motion.div
      className="pb-record-banner"
      initial={{ y: -28, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay: 0.42, type: "spring", stiffness: 300, damping: 20 }}
    >
      <span className="pb-banner-icon">{icon}</span>
      <div className="pb-banner-text">
        <span className="pb-banner-title">{title}</span>
        {subtitle && <span className="pb-banner-sub">{subtitle}</span>}
      </div>
    </motion.div>
  );
};

// ============================================================
// SUB-COMPONENTE: Seção de recordes pessoais
// ============================================================
interface RecordsSectionProps {
  result: TaskResultSummaryV1;
}

const RecordsSection: React.FC<RecordsSectionProps> = ({ result }) => {
  const {
    sessionCount,
    highScore,
    bestTime,
    bestResponseTime,
    isNewScoreRecord,
    isNewTimeRecord,
    isNewResponseRecord,
  } = result;

  const formatTime = (ms?: number) => {
    if (!ms) return "--";
    const s = ms / 1000;
    if (s >= 60) {
      const m = Math.floor(s / 60);
      const sec = (s % 60).toFixed(0).padStart(2, "0");
      return `${m}:${sec}`;
    }
    return `${s.toFixed(1)}s`;
  };

  if (sessionCount === 1) {
    return (
      <motion.div
        className="pb-records-section pb-records-first"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <span className="pb-first-label">✦ Seus recordes foram registrados!</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="pb-records-section"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.25 }}
    >
      <span className="pb-records-title">Seus melhores resultados</span>

      <div className="pb-records-grid">
        <div className={`pb-record-row ${isNewScoreRecord ? "pb-record-new" : ""}`}>
          <span className="pb-record-icon">🏆</span>
          <span className="pb-record-label">Melhor pontuação</span>
          <span className="pb-record-value">
            {highScore ?? "--"} pts
            {isNewScoreRecord && <span className="pb-new-badge">novo</span>}
          </span>
        </div>

        {bestTime !== undefined && (
          <div className={`pb-record-row ${isNewTimeRecord ? "pb-record-new" : ""}`}>
            <span className="pb-record-icon">⚡</span>
            <span className="pb-record-label">Mais rápido</span>
            <span className="pb-record-value">
              {formatTime(bestTime)}
              {isNewTimeRecord && <span className="pb-new-badge">novo</span>}
            </span>
          </div>
        )}

        {bestResponseTime !== undefined && (
          <div className={`pb-record-row ${isNewResponseRecord ? "pb-record-new" : ""}`}>
            <span className="pb-record-icon">⏱️</span>
            <span className="pb-record-label">Melhor reflexo</span>
            <span className="pb-record-value">
              {(bestResponseTime / 1000).toFixed(2)}s
              {isNewResponseRecord && <span className="pb-new-badge">novo</span>}
            </span>
          </div>
        )}

        <div className="pb-record-row pb-record-sessions">
          <span className="pb-record-icon">🔁</span>
          <span className="pb-record-label">Vezes praticada</span>
          <span className="pb-record-value">{sessionCount}×</span>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export const EndscreenV1: React.FC<EndscreenV1Props> = ({
  result,
  onClose,
  onRepeat,
  onBack,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (visible) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  if (!visible) return null;

  const anyRecord = result.isNewScoreRecord || result.isNewTimeRecord || result.isNewResponseRecord;

  const getHeadline = (stars: number): string => {
    if (stars === 5) return "Perfeito!";
    if (stars === 4) return "Ótimo!";
    if (stars === 3) return "Bom!";
    if (stars === 2) return "Quase lá...";
    if (stars === 1) return "Quase!";
    return "Tente novamente!";
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const s = (totalSec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const percentage = Math.round((result.correctSteps / result.totalSteps) * 100);

  // Filter perNote to only show notes with <100% accuracy (the ones that matter)
  const notesWithErrors = result.perNote.filter((n) => n.pct < 100);
  const allPerfect = notesWithErrors.length === 0;

  return (
    <div className="endscreen-overlay-v1">
      <div className="endscreen-backdrop-v1" onClick={handleClose} />

      <motion.div
        className="endscreen-panel-v1"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {/* Banner de novo recorde */}
        <AnimatePresence>
          {anyRecord && (
            <RecordBanner
              isNewScoreRecord={result.isNewScoreRecord}
              isNewTimeRecord={result.isNewTimeRecord}
              isNewResponseRecord={result.isNewResponseRecord}
              scoreDelta={result.scoreDelta}
              timeSavedMs={result.timeSavedMs}
              responseTimeSavedMs={result.responseTimeSavedMs}
            />
          )}
        </AnimatePresence>

        {/* Header: Headline + Estrelas */}
        <div className="endscreen-header-v1">
          <h1 className="endscreen-headline-v1">{getHeadline(result.starsEarned)}</h1>
          <div className="endscreen-stars-v1">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`star ${star <= result.starsEarned ? "filled" : "empty"}`}
              >
                ★
              </span>
            ))}
          </div>
        </div>

        {/* Summary — clear, human-readable */}
        <div className="endscreen-summary-v1">
          <div className="summary-row">
            <span className="label">Notas acertadas</span>
            <span className="value">{result.correctSteps} de {result.totalSteps}</span>
          </div>
          <div className="summary-row">
            <span className="label">Aproveitamento</span>
            <span className="value percentage">{percentage}%</span>
          </div>
          {result.duration !== undefined && (
            <div className="summary-row">
              <span className="label">Duração da sessão</span>
              <span className="value">{formatDuration(result.duration)}</span>
            </div>
          )}
          {result.responseMsAvg !== undefined && (
            <div className="summary-row">
              <span className="label">Tempo médio por nota</span>
              <span className="value">{(result.responseMsAvg / 1000).toFixed(2)}s</span>
            </div>
          )}
        </div>

        {/* Score Box — with explanation */}
        <div className={`endscreen-scorebox-v1 ${result.isNewScoreRecord ? "pb-score-record" : ""}`}>
          {result.isNewScoreRecord && <RecordParticles />}
          <div className={`score-value ${result.isNewScoreRecord ? "pb-score-burst" : ""}`}>
            {result.totalScore}
          </div>
          <div className="score-label">Pontuação</div>
          <div className="score-explain">
            {result.correctSteps} nota{result.correctSteps !== 1 ? "s" : ""} × 100 pts
          </div>
        </div>

        {/* Seção de Recordes Pessoais */}
        <RecordsSection result={result} />

        {/* Per-Note Stats — only show notes that had errors */}
        {result.perNote.length > 0 && (
          <div className="endscreen-stats-v1">
            <h3 className="stats-title">
              {allPerfect ? "Todas as notas perfeitas! 🎯" : "Notas para melhorar"}
            </h3>
            {!allPerfect && (
              <p className="stats-subtitle">
                Mostrando as notas onde você errou pelo menos uma vez
              </p>
            )}
            <div className="stats-list">
              {(allPerfect ? result.perNote.slice(0, 5) : notesWithErrors)
                .sort((a, b) => a.pct - b.pct)
                .map((note, idx) => (
                  <div key={idx} className="stat-row">
                    <div className="stat-note">
                      <span className="note-name">{note.label || note.noteName}</span>
                      <span className="note-count">
                        {note.correct}/{note.total} {allPerfect ? "" : "tentativas"}
                      </span>
                    </div>
                    <div className="stat-bar">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${note.pct}%`,
                          backgroundColor:
                            note.pct >= 80
                              ? "var(--success-neon)"
                              : note.pct >= 50
                              ? "var(--primary-neon)"
                              : "var(--error-neon)",
                        }}
                      />
                    </div>
                    <span className="stat-pct">{note.pct.toFixed(0)}%</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="endscreen-hint-v1">📄 Clique em qualquer lugar para fechar</div>

        <div className="endscreen-actions-v1">
          <button className="btn-action btn-secondary" onClick={onBack} title="Voltar para seleção">
            ← Voltar
          </button>
          <button className="btn-action btn-primary" onClick={onRepeat} title="Repetir esta lição">
            🔄 Repetir
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default EndscreenV1;