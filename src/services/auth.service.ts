import { MOCK_DELAY_MS } from '../utils/constants';
import { LoginRequest, LoginResponse, RegisterRequest } from '../types/auth.types';
import { mockUser } from '../mocks/user.mock';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const authService = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    await delay(MOCK_DELAY_MS);
    return {
      token: `mock_token_${Date.now()}`,
      refresh_token: `mock_refresh_${Date.now()}`,
      user: mockUser,
    };
  },

  async register(payload: RegisterRequest): Promise<LoginResponse> {
    await delay(MOCK_DELAY_MS);
    return {
      token: `mock_token_${Date.now()}`,
      refresh_token: `mock_refresh_${Date.now()}`,
      user: { ...mockUser, name: payload.name, email: payload.email },
    };
  },

  async logout(): Promise<void> {
    await delay(150);
  },
};
