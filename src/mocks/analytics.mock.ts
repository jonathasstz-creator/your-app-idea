import { AnalyticsOverview } from '../types/analytics.types';

export const mockAnalytics: AnalyticsOverview = {
  daily: Array.from({ length: 14 }).map((_, i) => ({
    date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    practice_minutes: Math.floor(Math.random() * 40),
    lessons_completed: Math.floor(Math.random() * 2),
    notes_played: 200 + Math.floor(Math.random() * 400),
  })),
  progress: {
    period: '30d',
    accuracy_trend: Array.from({ length: 14 }).map((_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      value: 0.8 + Math.random() * 0.15,
    })),
    score_trend: Array.from({ length: 14 }).map((_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      value: 1500 + Math.random() * 500,
    })),
    time_by_module: [
      { module: 'Clave de Sol', minutes: 320 },
      { module: 'Clave de Fá', minutes: 120 },
      { module: 'Ritmo', minutes: 80 },
    ],
  },
  difficult_notes: [
    { note: 'F4', miss_rate: 0.22, total_attempts: 45 },
    { note: 'G4', miss_rate: 0.18, total_attempts: 38 },
    { note: 'B3', miss_rate: 0.15, total_attempts: 30 },
  ],
};
