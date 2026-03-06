/**
 * ENDSCREEN - Barrel Exports
 * Arquivo: viewer/components/Endscreen/index.ts
 * 
 * Exporta todos os componentes e hooks do Endscreen
 */

export { EndscreenV1 } from "./EndscreenV1";
export { EndscreenV2 } from "./EndscreenV2";
export { useTaskResult, EndscreenContainer, useEndscreenOverlayState } from "./useTaskResult.tsx";

// Re-export types para conveniência
export type {
  AttemptLog,
  TaskResultSummary,
  TaskResultSummaryV1,
  TaskResultSummaryV2,
  PerNoteStatV1,
  PerChordStatV2,
  TaskMode,
  TaskVersion,
} from "../../types/task";
