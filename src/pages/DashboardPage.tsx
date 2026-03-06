import React from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useUserContext } from '../contexts/UserContext';
import { useLessons } from '../hooks/useLessons';

const DashboardPage: React.FC = () => {
  const { profile } = useUserContext();
  const { modules } = useLessons();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">Olá, {profile?.name ?? 'musicista'}</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Continuar" body={modules[0]?.chapters[0]?.lessons[0]?.title ?? 'Selecione uma lição'} />
            <Card title="Streak" body={`${profile?.current_streak ?? 0} dias`} />
            <Card title="Lições completas" body={`${profile?.lessons_completed ?? 0}`} />
          </div>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recomendadas</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {modules.flatMap((m) => m.chapters).flatMap((c) => c.lessons).slice(0, 4).map((l) => (
                <Card key={l.id} title={l.title} body={`${l.duration_estimate_min} min · dif ${l.difficulty}`} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
    <p className="text-xs text-slate-500 uppercase">{title}</p>
    <p className="text-lg font-semibold">{body}</p>
  </div>
);

export default DashboardPage;
