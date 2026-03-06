import React, { useEffect, useState } from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useUserContext } from '../contexts/UserContext';
import { UserSettings } from '../types/auth.types';
import { Button } from '../components/shared/Button';

const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useUserContext();
  const [draft, setDraft] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!draft) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">Configurações</h1>
          <section className="grid md:grid-cols-2 gap-4">
            <Panel title="Áudio">
              <label className="block text-sm">Volume
                <input type="range" min={0} max={100} value={draft.audio.volume} onChange={(e) => setDraft({ ...draft, audio: { ...draft.audio, volume: Number(e.target.value) } })} />
              </label>
              <label className="block text-sm">Latência (ms)
                <input type="number" value={draft.audio.latency_ms} onChange={(e) => setDraft({ ...draft, audio: { ...draft.audio, latency_ms: Number(e.target.value) } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1" />
              </label>
            </Panel>
            <Panel title="Prática">
              <label className="block text-sm">Lead time (ms)
                <input type="number" value={draft.practice.lead_time_ms} onChange={(e) => setDraft({ ...draft, practice: { ...draft.practice, lead_time_ms: Number(e.target.value) } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1" />
              </label>
              <label className="block text-sm">Count-in (compassos)
                <input type="number" value={draft.practice.count_in_bars} onChange={(e) => setDraft({ ...draft, practice: { ...draft.practice, count_in_bars: Number(e.target.value) } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1" />
              </label>
            </Panel>
          </section>
          <Button onClick={() => updateSettings(draft)}>Salvar</Button>
        </main>
      </div>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="p-4 border border-slate-800 rounded-xl bg-slate-900/50 space-y-3">
    <h3 className="font-semibold">{title}</h3>
    {children}
  </div>
);

export default SettingsPage;
