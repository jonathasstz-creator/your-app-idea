import { UserProfile } from '../types/auth.types';

export const mockUser: UserProfile = {
  id: 'user_001',
  name: 'João Silva',
  email: 'joao@example.com',
  avatar_url: 'https://i.pravatar.cc/150?u=joao',
  created_at: '2025-01-01T00:00:00Z',
  total_practice_hours: 42.5,
  lessons_completed: 28,
  current_streak: 7,
  longest_streak: 15,
  badges: [
    {
      id: 'badge_001',
      name: 'Primeira Lição',
      icon: '🎵',
      description: 'Complete sua primeira lição',
      unlocked_at: '2025-01-02T10:00:00Z',
    },
  ],
};
