import { useEffect, useState } from 'react';
import { analyticsService } from '../services/analytics.service';
import { AnalyticsOverview } from '../types/analytics.types';

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    analyticsService.getOverview().then(setData).finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
