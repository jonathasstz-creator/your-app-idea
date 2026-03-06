import { MOCK_DELAY_MS } from '../utils/constants';
import { mockAnalytics } from '../mocks/analytics.mock';
import { AnalyticsOverview } from '../types/analytics.types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const analyticsService = {
  async getOverview(): Promise<AnalyticsOverview> {
    await delay(MOCK_DELAY_MS);
    return mockAnalytics;
  },
};
