import { COLORS } from './constants';

interface HudData {
  step: number;
  total: number | null;
  status: string;
  scoreTotal?: number;
  scoreDelta?: number;
  streak?: number;
  bestStreak?: number;
}

const TERMINAL_STATUSES = new Set(['FINISHED', 'DONE']);

export class UIService {
  private hudStep = document.getElementById("hud-step");
  private hudStatus = document.getElementById("hud-status");
  private hudScore = document.getElementById("hud-score");
  private hudStreak = document.getElementById("hud-streak");
  private feedback = document.getElementById("judge-feedback");
  private wsIndicator = document.getElementById("ws-indicator");
  private wsText = document.getElementById("ws-text");
  private hudTimer = document.getElementById("hud-timer");
  private animateTimeout: number | null = null;

  // Track whether score/streak have been shown (sticky visibility)
  private scoreShown = false;
  private streakShown = false;
  private lastScoreTotal: number | undefined;
  private lastStreak: number | undefined;
  // Track terminal status to prevent overwrite
  private isTerminal = false;

  constructor() {
    console.log("[UI] Elementos encontrados:", {
      hudStep: !!this.hudStep,
      hudStatus: !!this.hudStatus,
      hudScore: !!this.hudScore,
      hudStreak: !!this.hudStreak,
    });
  }

  updateHud(data: HudData | number, total?: number | null, status?: string) {
    let step: number;
    let totalSteps: number | null;
    let statusStr: string;
    let scoreTotal: number | undefined;
    let scoreDelta: number | undefined;
    let streak: number | undefined;
    let bestStreak: number | undefined;

    if (typeof data === "number") {
      step = data;
      totalSteps = total ?? null;
      statusStr = status ?? "";
    } else {
      step = data.step;
      totalSteps = data.total;
      statusStr = data.status;
      scoreTotal = data.scoreTotal;
      scoreDelta = data.scoreDelta;
      streak = data.streak;
      bestStreak = data.bestStreak;
    }

    // --- Step ---
    if (this.hudStep) {
      this.hudStep.textContent = totalSteps ? `${step + 1}/${totalSteps}` : `${step + 1}`;
      if (this.animateTimeout !== null) {
        window.clearTimeout(this.animateTimeout);
      }
      this.hudStep.classList.add("animate");
      this.animateTimeout = window.setTimeout(() => {
        if (this.hudStep) {
          this.hudStep.classList.remove("animate");
        }
        this.animateTimeout = null;
      }, 500);
    }

    // --- Status priority ---
    const s = statusStr.toUpperCase();

    // RESET clears terminal lock
    if (s === 'RESET') {
      this.isTerminal = false;
      // Also reset sticky visibility
      this.scoreShown = false;
      this.streakShown = false;
      this.lastScoreTotal = undefined;
      this.lastStreak = undefined;
    }

    if (this.hudStatus) {
      // If already terminal, only RESET can change status
      if (!this.isTerminal || s === 'RESET') {
        this.hudStatus.textContent = s || "--";
        this.hudStatus.className = "hud-value";
        if (s === "HIT") this.hudStatus.classList.add("status-hit");
        if (s === "MISS") this.hudStatus.classList.add("status-miss");
        if (s === "LATE") this.hudStatus.classList.add("status-late");

        if (TERMINAL_STATUSES.has(s)) {
          this.isTerminal = true;
        }
      }
    }

    // --- Score (sticky: once shown, stays visible) ---
    if (this.hudScore) {
      if (scoreTotal !== undefined) {
        this.lastScoreTotal = scoreTotal;
        this.scoreShown = true;
        this.hudScore.textContent = `${scoreTotal}`;
        this.hudScore.style.display = "block";

        if (scoreDelta !== undefined && scoreDelta > 0) {
          const existingDelta = this.hudScore.querySelector(".score-delta");
          if (existingDelta) existingDelta.remove();

          const deltaEl = document.createElement("span");
          deltaEl.textContent = `+${scoreDelta}`;
          deltaEl.className = "score-delta";
          this.hudScore.appendChild(deltaEl);
          setTimeout(() => {
            if (deltaEl.parentNode) deltaEl.remove();
          }, 300);
        }
      } else if (this.scoreShown) {
        // Keep visible with last known value (don't hide)
        this.hudScore.style.display = "block";
      } else {
        this.hudScore.style.display = "none";
      }
    }

    // --- Streak (sticky: once shown, stays visible) ---
    if (this.hudStreak) {
      if (streak !== undefined) {
        this.lastStreak = streak;
        this.streakShown = true;
        this.hudStreak.textContent = `x${streak}`;
        this.hudStreak.style.display = "block";
      } else if (this.streakShown) {
        // Keep visible with last known value (don't hide)
        this.hudStreak.style.display = "block";
      } else {
        this.hudStreak.style.display = "none";
      }
    }
  }

  updateWsStatus(state: 'connected' | 'disconnected' | 'connecting' | 'error', message?: string) {
    if (!this.wsIndicator || !this.wsText) return;
    this.wsIndicator.className = "ws-indicator";
    switch (state) {
      case 'connected':
        this.wsIndicator.classList.add("ws-connected");
        this.wsText.textContent = "Conectado";
        break;
      case 'connecting':
        this.wsIndicator.classList.add("ws-connecting");
        this.wsText.textContent = message || "Conectando...";
        break;
      case 'error':
      case 'disconnected':
        this.wsText.textContent = message || "Desconectado";
        break;
    }
  }

  updateTimer(ms: number) {
    if (!this.hudTimer) return;
    const totalSec = Math.floor(ms / 1000);
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    this.hudTimer.textContent = `${min}:${sec}.${cs}`;
  }

  setFeedback(correct: boolean | null) {
    if (!this.feedback) return;
    if (correct === true) {
      this.feedback.textContent = "Certo";
      this.feedback.className = "judge-feedback is-correct";
    } else if (correct === false) {
      this.feedback.textContent = "Errado";
      this.feedback.className = "judge-feedback is-wrong";
    } else {
      this.feedback.textContent = "Aguardando…";
      this.feedback.className = "judge-feedback";
    }
  }
}
