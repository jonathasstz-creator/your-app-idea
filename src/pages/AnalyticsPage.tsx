import React from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useAnalytics } from '../hooks/useAnalytics';
import { ActivityHeatmap } from '../components/analytics/ActivityHeatmap';
import { ProgressChart } from '../components/analytics/ProgressChart';
import { StatsCard } from '../components/analytics/StatsCard';

const AnalyticsPage: React.FC = () => {
  const { data } = useAnalytics();
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <ActivityHeatmap days={data.daily} />
          <ProgressChart progress={data.progress} />
          <StatsCard difficult={data.difficult_notes} />
        </main>
      </div>
    </div>
  );
};

export default AnalyticsPage;
