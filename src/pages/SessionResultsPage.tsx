import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { practiceService } from '../services/practice.service';
import { SessionSummary } from '../types/practice.types';

const SessionResultsPage: React.FC = () => {
  const { sessionId = '' } = useParams();
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    practiceService.endSession(sessionId || 'session_mock_1').then(setSummary);
  }, [sessionId]);

  if (!summary) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">Resultados</h1>
          <div className="grid md:grid-cols-3 gap-4">
            <Card label="Score" value={summary.final_score} />
            <Card label="Accuracy" value={`${(summary.accuracy_percent * 100).toFixed(1)}%`} />
            <Card label="Tempo" value={`${(summary.duration_seconds / 60).toFixed(1)} min`} />
          </div>
          <div className="flex gap-3">
            <Link to={`/practice/${summary.lesson_id}`} className="px-4 py-2 bg-indigo-600 rounded">Tentar novamente</Link>
            <Link to="/lessons" className="px-4 py-2 border border-slate-700 rounded">Próxima lição</Link>
          </div>
        </main>
      </div>
    </div>
  );
};

const Card: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
    <p className="text-xs text-slate-500 uppercase">{label}</p>
    <p className="text-xl font-semibold">{value}</p>
  </div>
);

export default SessionResultsPage;
