/**
 * ENDSCREEN V2 - POLIFÔNICO v2.1
 * Arquivo: viewer/components/Endscreen/EndscreenV2.tsx
 *
 * v2.1: UX clarity rewrite
 * - Score explained (X passos × 100 pts)
 * - "Steps Corretos" → "Passos completados"
 * - "Acurácia (Steps)" → "Aproveitamento"
 * - "Acurácia (Notas)" → "Precisão por nota"
 * - perNote stats: show only errors, label as "tentativas"
 * - Threshold 3 stars: humanized
 * - Timing: seconds not ms
 *
 * 🔒 ZERO QUEBRAS: overlay isolado, sem alterar áudio/timing
 */

import React, { useEffect, useState } from "react";
import { TaskResultSummaryV2, PerChordStatV2, PerNoteStatV1 } from "../../types/task";
import "./endscreen.css";

interface EndscreenV2Props {
  result: TaskResultSummaryV2;
  onClose: () => void;
  onRepeat: () => void;
  onBack: () => void;
  onNext?: () => void;
  hasNext?: boolean;
}

type TabType = "summary" | "chords" | "notes";
type SortType = "best" | "worst" | "all";

export const EndscreenV2: React.FC<EndscreenV2Props> = ({
  result,
  onClose,
  onRepeat,
  onBack,
  onNext,
  hasNext = false,
}) => {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [sortOrder, setSortOrder] = useState<SortType>("all");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "Enter") {
        setExpanded(true);
      }
    };

    if (visible) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  const handleExpand = () => {
    setExpanded(!expanded);
  };

  if (!visible) return null;

  const getHeadline = (stars: number): string => {
    if (stars === 5) return "Perfeito! 🎉";
    if (stars === 4) return "Ótimo! ⭐";
    if (stars === 3) return "Bom! 👍";
    if (stars === 2) return "Quase lá... 💪";
    if (stars === 1) return "Continue praticando! 📚";
    return "Tente novamente! 🎯";
  };

  const percentage = Math.round((result.correctSteps / result.totalSteps) * 100);
  const isHighScore = result.highScore > 0 && result.totalScore >= result.highScore;

  const sortStats = <T extends { pct: number }>(items: T[], order: SortType): T[] => {
    if (order === "best") return [...items].sort((a, b) => b.pct - a.pct);
    if (order === "worst") return [...items].sort((a, b) => a.pct - b.pct);
    return items;
  };

  const sortedChords = sortStats(result.perChord, sortOrder);
  const sortedNotes = sortStats(result.perNote || [], sortOrder);

  const formatMs = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms}ms`;
  };

  return (
    <div className="endscreen-overlay-v2">
      <div className="endscreen-backdrop-v2" onClick={handleClose} />

      <div className={`endscreen-panel-v2 ${expanded ? "expanded" : ""}`}>
        {/* Header */}
        <div className="endscreen-header-v2">
          <h1 className="endscreen-headline-v2">{getHeadline(result.starsEarned)}</h1>
          <div className="endscreen-stars-v2">
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

        {/* Summary */}
        <div className="endscreen-summary-v2">
          <div className="summary-row">
            <span className="label">Passos completados</span>
            <span className="value">
              {result.correctSteps} de {result.totalSteps}
            </span>
          </div>
          <div className="summary-row">
            <span className="label">Aproveitamento</span>
            <span className="value percentage">{percentage}%</span>
          </div>
          {result.noteAccuracy !== undefined && (
            <div className="summary-row">
              <span className="label">Precisão por nota</span>
              <span className="value percentage">
                {Math.round(result.noteAccuracy * 100)}%
                {result.correctNotes !== undefined && result.totalExpectedNotes !== undefined && (
                  <span className="value-detail"> ({result.correctNotes}/{result.totalExpectedNotes})</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Threshold 3 Stars — humanized */}
        <div className="endscreen-threshold-v2">
          <span className="threshold-label">Para 3 estrelas ⭐</span>
          <span className="threshold-value">
            acerte {result.stars3RequiredCorrect} de {result.totalSteps} passos
          </span>
        </div>

        {/* Score Box — with explanation */}
        <div className="endscreen-scorebox-v2">
          <div className="score-line">
            <span className="score-label">Pontuação</span>
            <span className="score-value">{result.scoreBase}</span>
          </div>
          <div className="score-explain">
            {result.correctSteps} passo{result.correctSteps !== 1 ? "s" : ""} × 100 pts
          </div>
          {result.timeBonus > 0 && (
            <div className="score-line">
              <span className="score-label">Bônus de tempo</span>
              <span className="score-bonus">+{result.timeBonus}</span>
            </div>
          )}
          {result.timeBonus > 0 && (
            <div className="score-line total">
              <span className="score-label">Total</span>
              <span className="score-value-total">{result.totalScore}</span>
            </div>
          )}
          {isHighScore && (
            <div className="score-line highscore">
              <span className="score-hs">🏆 Novo recorde!</span>
            </div>
          )}
          {!isHighScore && result.highScore > 0 && (
            <div className="score-line highscore">
              <span className="score-hs">Seu recorde: {result.highScore} pts</span>
            </div>
          )}
        </div>

        {/* Expandable Details */}
        <div className="endscreen-expandable-v2" onClick={handleExpand}>
          <span className="hint-text">
            {expanded ? "Recolher detalhes" : "Ver detalhes da sessão"}
          </span>
          <span className="expand-indicator">{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="endscreen-details-v2">
            {/* Tabs */}
            <div className="detail-tabs">
              <button
                className={`tab ${activeTab === "summary" ? "active" : ""}`}
                onClick={() => setActiveTab("summary")}
              >
                Tempos
              </button>
              <button
                className={`tab ${activeTab === "chords" ? "active" : ""}`}
                onClick={() => setActiveTab("chords")}
              >
                Acordes
              </button>
              <button
                className={`tab ${activeTab === "notes" ? "active" : ""}`}
                onClick={() => setActiveTab("notes")}
              >
                Notas
              </button>
            </div>

            {/* Sort Controls */}
            <div className="sort-controls">
              <button
                className={sortOrder === "best" ? "active" : ""}
                onClick={() => setSortOrder("best")}
              >
                Melhores
              </button>
              <button
                className={sortOrder === "worst" ? "active" : ""}
                onClick={() => setSortOrder("worst")}
              >
                Para melhorar
              </button>
              <button
                className={sortOrder === "all" ? "active" : ""}
                onClick={() => setSortOrder("all")}
              >
                Todos
              </button>
            </div>

            {/* Tab Content */}
            <div className="detail-content">
              {activeTab === "summary" && (
                <div className="summary-content">
                  <div className="detail-row">
                    <span>Tempo médio por passo</span>
                    <span className="mono">{formatMs(result.responseMsAvg)}</span>
                  </div>
                  <div className="detail-row">
                    <span>Mais rápido</span>
                    <span className="mono">{formatMs(result.responseMsMin)}</span>
                  </div>
                  <div className="detail-row">
                    <span>Mais lento</span>
                    <span className="mono">{formatMs(result.responseMsMax)}</span>
                  </div>
                  <div className="detail-row">
                    <span>Modo</span>
                    <span>{result.mode === "WAIT" ? "Passo a passo" : "Tempo real"}</span>
                  </div>
                </div>
              )}

              {activeTab === "chords" && (
                <div className="chords-content">
                  {sortedChords.length === 0 ? (
                    <div className="empty-state">Nenhum acorde nesta lição</div>
                  ) : (
                    sortedChords.map((chord, idx) => (
                      <ChordStatRow key={idx} chord={chord} />
                    ))
                  )}
                </div>
              )}

              {activeTab === "notes" && (
                <div className="notes-content">
                  {sortedNotes.length === 0 ? (
                    <div className="empty-state">Nenhuma nota registrada</div>
                  ) : (
                    sortedNotes.map((note, idx) => (
                      <NoteStatRow key={idx} note={note} />
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="detail-close" onClick={() => setExpanded(false)}>
              ▲ Recolher
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="endscreen-actions-v2">
          <button className="btn-action btn-secondary" onClick={onBack} title="Voltar">
            ← Voltar
          </button>
          <button className="btn-action btn-primary" onClick={onRepeat} title="Repetir">
            🔄 Repetir
          </button>
          {hasNext && onNext && (
            <button className="btn-action btn-success" onClick={onNext} title="Próxima">
              Próximo →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Componente para mostrar estatísticas de um acorde
const ChordStatRow: React.FC<{ chord: PerChordStatV2 }> = ({ chord }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="stat-row chord-row">
      <div className="stat-chord">
        <span className="chord-name">{chord.label || chord.chordName}</span>
        <span className="chord-count">
          {chord.correct}/{chord.total} tentativas
        </span>
      </div>
      <div className="stat-bar">
        <div
          className="bar-fill"
          style={{
            width: `${chord.pct}%`,
            backgroundColor:
              chord.pct >= 80
                ? "var(--success-neon)"
                : chord.pct >= 50
                ? "var(--primary-neon)"
                : "var(--error-neon)",
          }}
        />
      </div>
      <span className="stat-pct">{chord.pct.toFixed(0)}%</span>
      <button
        className="expand-btn"
        onClick={() => setShowDetails(!showDetails)}
        title="Ver notas do acorde"
      >
        {showDetails ? "▲" : "▼"}
      </button>
      
      {showDetails && (
        <div className="chord-notes-detail">
          {chord.notes.map((note, idx) => (
            <div key={idx} className="note-detail">
              <span>{note.noteName}</span>
              <span>
                {note.correct}/{note.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Componente para mostrar estatísticas de uma nota
const NoteStatRow: React.FC<{ note: PerNoteStatV1 }> = ({ note }) => (
  <div className="stat-row">
    <div className="stat-note">
      <span className="note-name">{note.label || note.noteName}</span>
      <span className="note-count">
        {note.correct}/{note.total} tentativas
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
);

export default EndscreenV2;