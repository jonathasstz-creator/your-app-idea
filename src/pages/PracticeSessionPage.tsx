import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { SheetMusicViewer } from '../components/practice/SheetMusicViewer';
import { FallingNotes } from '../components/practice/FallingNotes';
import { PianoKeyboard } from '../components/practice/PianoKeyboard';
import { HUD } from '../components/practice/HUD';
import { TransportControls } from '../components/practice/TransportControls';
import { CountIn } from '../components/practice/CountIn';
import { ModeSelector } from '../components/practice/ModeSelector';
import { practiceService } from '../services/practice.service';
import { usePracticeState } from '../hooks/usePracticeState';
import { PracticeMode } from '../types/practice.types';

const PracticeSessionPage: React.FC = () => {
  const { lessonId = 'lesson_001' } = useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<PracticeMode>('WAIT');
  const [countIn, setCountIn] = useState(false);
  const state = usePracticeState(sessionId ?? undefined);

  useEffect(() => {
    practiceService.startSession(lessonId, mode).then((id) => setSessionId(id));
  }, [lessonId, mode]);

  const handlePlay = () => setCountIn(true);
  const handleReload = () => practiceService.startSession(lessonId, mode).then(setSessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex relative">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-4 relative">
          <div className="flex items-center justify-between">
            <TransportControls
              mode={mode}
              onPlay={handlePlay}
              onPause={() => setCountIn(false)}
              onReload={handleReload}
              onModeChange={() => setMode((m) => (m === 'WAIT' ? 'FILM' : m === 'FILM' ? 'PLAIN' : 'WAIT'))}
            />
            <ModeSelector mode={mode} onChange={setMode} />
          </div>
          <SheetMusicViewer xml="mock" />
          <FallingNotes />
          <PianoKeyboard />
          <HUD state={state} />
          <CountIn start={countIn} onDone={() => setCountIn(false)} />
        </main>
      </div>
    </div>
  );
};

export default PracticeSessionPage;
