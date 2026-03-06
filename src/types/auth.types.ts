export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  refresh_token: string;
  user: UserProfile;
}

export interface UserProfile extends User {
  total_practice_hours: number;
  lessons_completed: number;
  current_streak: number;
  longest_streak: number;
  badges: Badge[];
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked_at: string;
}

export interface UserSettings {
  audio: {
    volume: number;
    latency_ms: number;
    metronome_enabled: boolean;
  };
  visual: {
    theme: 'light' | 'dark';
    note_colors: Record<string, string>;
  };
  practice: {
    lead_time_ms: number;
    count_in_bars: number;
    default_mode: 'WAIT' | 'FILM' | 'PLAIN';
  };
}
