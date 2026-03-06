
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

  constructor() {
    // DEBUG: Verificar se elementos foram encontrados
    console.log("[UI] Elementos encontrados:", {
      hudStep: !!this.hudStep,
      hudStatus: !!this.hudStatus,
      hudScore: !!this.hudScore,
      hudStreak: !!this.hudStreak,
    });
  }

  updateHud(data: HudData | number, total?: number | null, status?: string) {
    // Compatibilidade: aceitar assinatura antiga (step, total, status)
    let step: number;
    let totalSteps: number | null;
    let statusStr: string;
    let scoreTotal: number | undefined;
    let scoreDelta: number | undefined;
    let streak: number | undefined;
    let bestStreak: number | undefined;

    if (typeof data === "number") {
      // Assinatura antiga (compatibilidade)
      step = data;
      totalSteps = total ?? null;
      statusStr = status ?? "";
    } else {
      // Nova assinatura (objeto)
      step = data.step;
      totalSteps = data.total;
      statusStr = data.status;
      scoreTotal = data.scoreTotal;
      scoreDelta = data.scoreDelta;
      streak = data.streak;
      bestStreak = data.bestStreak;
    }

    // Atualizar step
    if (this.hudStep) {
      this.hudStep.textContent = totalSteps ? `${step + 1}/${totalSteps}` : `${step + 1}`;

      // Trigger animation on step change
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

    // Atualizar status
    if (this.hudStatus) {
      const s = statusStr.toUpperCase();
      this.hudStatus.textContent = s || "--";
      this.hudStatus.className = "hud-value";
      if (s === "HIT") this.hudStatus.classList.add("status-hit");
      if (s === "MISS") this.hudStatus.classList.add("status-miss");
      if (s === "LATE") this.hudStatus.classList.add("status-late");
    }

    // Atualizar score (sempre mostrar se recebido, mesmo se 0)
    if (this.hudScore) {
      if (scoreTotal !== undefined) {
        this.hudScore.textContent = `${scoreTotal}`;  // Apenas o número, o label já diz "Score"
        this.hudScore.style.display = "block";

        // Animar score_delta se existir
        if (scoreDelta !== undefined && scoreDelta > 0) {
          // Remover delta anterior se existir
          const existingDelta = this.hudScore.querySelector(".score-delta");
          if (existingDelta) {
            existingDelta.remove();
          }

          // Criar elemento temporário para animação
          const deltaEl = document.createElement("span");
          deltaEl.textContent = `+${scoreDelta}`;
          deltaEl.className = "score-delta";
          this.hudScore.appendChild(deltaEl);
          setTimeout(() => {
            if (deltaEl.parentNode) {
              deltaEl.remove();
            }
          }, 300);
        }
      } else {
        // Só esconder se realmente não foi enviado (undefined)
        this.hudScore.style.display = "none";
      }
    }

    // Atualizar streak (sempre mostrar se recebido, mesmo se 0)
    if (this.hudStreak) {
      if (streak !== undefined) {
        this.hudStreak.textContent = `x${streak}`;  // Apenas "xN", o label já diz "Streak"
        this.hudStreak.style.display = "block";
      } else {
        // Só esconder se realmente não foi enviado (undefined)
        this.hudStreak.style.display = "none";
      }
    }
  }

  /**
   * Atualiza o status visual da conexão WebSocket.
   */
  updateWsStatus(state: 'connected' | 'disconnected' | 'connecting' | 'error', message?: string) {
    if (!this.wsIndicator || !this.wsText) return;

    this.wsIndicator.className = "ws-indicator"; // reset

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
