/**
 * HOOK: useTaskResult
 * Arquivo: viewer/components/Endscreen/useTaskResult.ts
 * 
 * 📮 Gerencia:
 * - Event listeners para onTaskCompleted
 * - Renderiza EndscreenV1 ou V2 baseado no resultado
 * - Integra com handlers de ações (Voltar, Repetir, Próximo)
 * - Bloqueia input durante overlay
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { TaskResultSummary, TaskResultSummaryV1, TaskResultSummaryV2 } from "../../types/task";
import { onTaskCompleted, dispatchTaskCompletion } from "../../services/taskCompletion";
import { EndscreenV1 } from "./EndscreenV1";
import { EndscreenV2 } from "./EndscreenV2";

interface UseTaskResultOptions {
  onBack?: () => void;
  onRepeat?: () => void;
  onNext?: () => void;
  hasNext?: boolean;
  disableInputWhileOverlay?: boolean;
}

interface UseTaskResultReturn {
  result: TaskResultSummary | null;
  isVisible: boolean;
  hideEndscreen: () => void;
  triggerEndscreen: (result: TaskResultSummary) => void; // Para testes
}

/**
 * Hook que gerencia o ciclo de vida do endscreen
 * Ideal para colocar no componente pai (App, Trainer, etc)
 */
export function useTaskResult(options: UseTaskResultOptions = {}): UseTaskResultReturn {
  const {
    onBack,
    onRepeat,
    onNext,
    hasNext = false,
    disableInputWhileOverlay = true,
  } = options;

  const [result, setResult] = useState<TaskResultSummary | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const inputBlockerRef = useRef<Map<string, boolean>>(new Map());

  // Subscrever ao evento de fim de tarefa
  useEffect(() => {
    unsubscribeRef.current = onTaskCompleted((taskResult) => {
      console.log("[useTaskResult] Task completed:", taskResult);
      setResult(taskResult);
      setIsVisible(true);

      if (disableInputWhileOverlay) {
        blockInput();
      }
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [disableInputWhileOverlay]);

  // Bloquear input durante overlay (opcional)
  const blockInput = useCallback(() => {
    // Desabilitar listeners de teclado/mouse do treino
    const handlers = [
      "keydown",
      "keyup",
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
    ];

    handlers.forEach((eventType) => {
      inputBlockerRef.current?.set(eventType, true);
    });

    // Emit custom event que o Trainer vai ouvir
    window.dispatchEvent(
      new CustomEvent("endscreen:overlay-active", { detail: { active: true } })
    );
  }, []);

  const unblockInput = useCallback(() => {
    inputBlockerRef.current?.clear();
    window.dispatchEvent(
      new CustomEvent("endscreen:overlay-active", { detail: { active: false } })
    );
  }, []);

  const hideEndscreen = useCallback(() => {
    setIsVisible(false);
    setResult(null);
    unblockInput();
  }, [unblockInput]);

  const handleClose = useCallback(() => {
    hideEndscreen();
  }, [hideEndscreen]);

  const handleBack = useCallback(() => {
    hideEndscreen();
    onBack?.();
  }, [hideEndscreen, onBack]);

  const handleRepeat = useCallback(() => {
    hideEndscreen();
    onRepeat?.();
  }, [hideEndscreen, onRepeat]);

  const handleNext = useCallback(() => {
    hideEndscreen();
    onNext?.();
  }, [hideEndscreen, onNext]);

  const triggerEndscreen = useCallback((taskResult: TaskResultSummary) => {
    // Para testes: permite disparar manualmente
    dispatchTaskCompletion(taskResult);
  }, []);

  return {
    result,
    isVisible,
    hideEndscreen,
    triggerEndscreen,
  };
}

/**
 * Componente wrapper que renderiza EndscreenV1 ou V2
 * baseado no tipo de resultado
 */
interface EndscreenContainerProps {
  result: TaskResultSummary | null;
  isVisible: boolean;
  onClose: () => void;
  onBack: () => void;
  onRepeat: () => void;
  onNext?: () => void;
  hasNext?: boolean;
}

export function EndscreenContainer({
  result,
  isVisible,
  onClose,
  onBack,
  onRepeat,
  onNext,
  hasNext = false,
}: EndscreenContainerProps) {
  if (!isVisible || !result) return null;

  if (result.version === "V1") {
    return (
      <EndscreenV1
        result={result as TaskResultSummaryV1}
        onClose={onClose}
        onBack={onBack}
        onRepeat={onRepeat}
      />
    );
  }

  if (result.version === "V2") {
    return (
      <EndscreenV2
        result={result as TaskResultSummaryV2}
        onClose={onClose}
        onBack={onBack}
        onRepeat={onRepeat}
        onNext={onNext}
        hasNext={hasNext}
      />
    );
  }

  return null;
}

/**
 * Hook para detectar quando overlay está ativo
 * Usado pelos modos WAIT/FILM para pausar input
 */
export function useEndscreenOverlayState(): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleOverlayChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsActive(customEvent.detail?.active ?? false);
    };

    window.addEventListener("endscreen:overlay-active", handleOverlayChange);

    return () => {
      window.removeEventListener("endscreen:overlay-active", handleOverlayChange);
    };
  }, []);

  return isActive;
}
