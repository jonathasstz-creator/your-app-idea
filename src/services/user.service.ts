import { MOCK_DELAY_MS } from '../utils/constants';
import { UserProfile, UserSettings } from '../types/auth.types';
import { mockUser } from '../mocks/user.mock';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const userService = {
  async getProfile(): Promise<UserProfile> {
    await delay(MOCK_DELAY_MS);
    return mockUser;
  },

  async updateProfile(input: Partial<UserProfile>): Promise<UserProfile> {
    await delay(MOCK_DELAY_MS);
    Object.assign(mockUser, input);
    return mockUser;
  },

  async getSettings(): Promise<UserSettings> {
    await delay(MOCK_DELAY_MS / 2);
    return {
      audio: { volume: 70, latency_ms: 40, metronome_enabled: true },
      visual: { theme: 'dark', note_colors: {} },
      practice: { lead_time_ms: 2000, count_in_bars: 2, default_mode: 'WAIT' },
    };
  },

  async updateSettings(settings: UserSettings): Promise<UserSettings> {
    await delay(MOCK_DELAY_MS / 2);
    return settings;
  },
};
