import React, { useState } from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useLessons } from '../hooks/useLessons';
import type { Trail, TrailChapter } from '../viewer/catalog/types';

const LessonsHubPage: React.FC = () => {
  const { trails, loading } = useLessons();
  const [activeTrailId, setActiveTrailId] = useState<string | null>(null);

  const selectedTrail = trails.find((t) => t.trail_id === activeTrailId) ?? trails[0];

  // Flatten all chapters from the selected trail
  const chapters: TrailChapter[] =
    selectedTrail?.levels?.flatMap(
      (level) => level.modules?.flatMap((mod) => mod.chapters ?? []) ?? []
    ) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">Catálogo de Lições</h1>
          {loading && <p className="text-muted-foreground">Carregando...</p>}

          {/* Trail selector */}
          <div className="grid md:grid-cols-3 gap-3">
            {trails.map((trail) => (
              <button
                key={trail.trail_id}
                onClick={() => setActiveTrailId(trail.trail_id ?? null)}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  selectedTrail?.trail_id === trail.trail_id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <h3 className="font-semibold">{trail.title ?? 'Sem título'}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {trail.levels?.reduce(
                    (sum, l) =>
                      sum + (l.modules?.reduce((s, m) => s + (m.chapters?.length ?? 0), 0) ?? 0),
                    0
                  ) ?? 0}{' '}
                  capítulos
                </p>
              </button>
            ))}
          </div>

          {/* Chapters list */}
          {chapters.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">
                {selectedTrail?.title}
              </h2>
              {chapters.map((ch) => (
                <div
                  key={ch.chapter_id}
                  className={`p-4 rounded-xl border transition ${
                    ch.coming_soon
                      ? 'border-border bg-muted/30 opacity-60'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">
                          {ch.title ?? `Capítulo ${ch.chapter_id}`}
                        </h4>
                        {ch.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                            {ch.badge}
                          </span>
                        )}
                        {ch.coming_soon && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Em breve
                          </span>
                        )}
                      </div>
                      {ch.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ch.subtitle}</p>
                      )}
                      {ch.description && (
                        <p className="text-xs text-muted-foreground mt-1">{ch.description}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground space-y-0.5 ml-4 shrink-0">
                      {ch.difficulty && <div>{ch.difficulty}</div>}
                      {ch.hand && <div>Mão: {ch.hand}</div>}
                      {ch.allowed_notes && ch.allowed_notes.length > 0 && (
                        <div>{ch.allowed_notes.length} notas</div>
                      )}
                    </div>
                  </div>
                  {ch.skill_tags && ch.skill_tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {ch.skill_tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default LessonsHubPage;
