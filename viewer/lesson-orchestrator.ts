
import { LessonContentPacket } from './types';

export interface LessonOrchestrationCallbacks {
  onReset: (token: string) => Promise<void>;
  onLoadXML: (token: string, xml: string) => Promise<void>;
  onCommitSheet: (token: string, lessonId: string) => Promise<void>;
  onCommitPianoRoll: (token: string, notes: any[], lessonId: string) => Promise<void>;
}

export class LessonOrchestrator {
  private currentLessonId: string | null = null;
  private activeToken: string | null = null;

  async loadFromContent(
    content: LessonContentPacket,
    callbacks: LessonOrchestrationCallbacks
  ) {
    const { lesson_id, score } = content;
    
    // Generate new token for this load operation
    const token = `lesson_${lesson_id}_${Date.now()}`;
    this.activeToken = token;
    
    console.log(`[Orchestrator:${token}] Starting load for ${lesson_id}`);

    try {
      // 1. Reset
      await callbacks.onReset(token);
      if (!this.isValidToken(token)) return;

      // 2. Load XML
      if (score && score.xml_text) {
         await callbacks.onLoadXML(token, score.xml_text);
      } else {
         console.warn(`[Orchestrator:${token}] No XML content provided`);
      }
      if (!this.isValidToken(token)) return;

      // 3. Commit Sheet
      await callbacks.onCommitSheet(token, lesson_id);
      if (!this.isValidToken(token)) return;

      // 4. Commit Piano Roll
      await callbacks.onCommitPianoRoll(token, content.notes, lesson_id);

      if (this.isValidToken(token)) {
        this.currentLessonId = lesson_id;
        console.log(`[Orchestrator:${token}] ✅ Lesson ready: ${lesson_id}`);
      }

    } catch (e) {
      console.error(`[Orchestrator:${token}] Error loading lesson`, e);
    }
  }

  isValidToken(token: string): boolean {
    return this.activeToken === token;
  }

  getCurrentLessonId() {
    return this.currentLessonId;
  }
}
