import React from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useUserContext } from '../contexts/UserContext';
import { useLessons } from '../hooks/useLessons';

const DashboardPage: React.FC = () => {
  const { profile } = useUserContext();
  const { trails, loading: lessonsLoading, error: lessonsError } = useLessons();

  // Flatten all chapters from all trails for dashboard cards
  const allChapters = trails.flatMap(
    (t) => t.levels?.flatMap((l) => l.modules?.flatMap((m) => m.chapters ?? []) ?? []) ?? []
  );

  const firstChapter = allChapters[0];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">Olá, {profile?.name ?? 'musicista'}</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Continuar" body={firstChapter?.title ?? 'Selecione uma lição'} />
            <Card title="Streak" body={`${profile?.current_streak ?? 0} dias`} />
            <Card title="Lições completas" body={`${profile?.lessons_completed ?? 0}`} />
          </div>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recomendadas</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {allChapters.slice(0, 4).map((ch) => (
                <Card
                  key={ch.chapter_id}
                  title={ch.title ?? `Cap. ${ch.chapter_id}`}
                  body={[ch.hand, ch.difficulty].filter(Boolean).join(' · ') || 'Prática'}
                />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="p-4 rounded-xl border border-border bg-card">
    <p className="text-xs text-muted-foreground uppercase">{title}</p>
    <p className="text-lg font-semibold">{body}</p>
  </div>
);

export default DashboardPage;
