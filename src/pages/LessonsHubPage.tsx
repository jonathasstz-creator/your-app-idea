import React, { useState } from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useLessons } from '../hooks/useLessons';
import { ModuleCard } from '../components/lessons/ModuleCard';
import { ChapterList } from '../components/lessons/ChapterList';

const LessonsHubPage: React.FC = () => {
  const { modules, loading } = useLessons();
  const [active, setActive] = useState<string | null>(null);
  const selected = modules.find((m) => m.id === active) ?? modules[0];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">Catálogo de Lições</h1>
          {loading && <p>Carregando...</p>}
          <div className="grid md:grid-cols-3 gap-3">
            {modules.map((m) => (
              <ModuleCard key={m.id} module={m} onSelect={setActive} />
            ))}
          </div>
          {selected && <ChapterList chapters={selected.chapters} />}
        </main>
      </div>
    </div>
  );
};

export default LessonsHubPage;
