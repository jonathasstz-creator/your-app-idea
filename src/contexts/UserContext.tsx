import React, { createContext, useContext, useEffect, useState } from 'react';
import { userService } from '../services/user.service';
import { UserProfile, UserSettings } from '../types/auth.types';

interface UserContextValue {
  profile: UserProfile | null;
  settings: UserSettings | null;
  refresh: () => Promise<void>;
  updateSettings: (s: UserSettings) => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const load = async () => {
    const [p, s] = await Promise.all([userService.getProfile(), userService.getSettings()]);
    setProfile(p);
    setSettings(s);
  };

  useEffect(() => {
    load();
  }, []);

  const updateSettings = async (s: UserSettings) => {
    const saved = await userService.updateSettings(s);
    setSettings(saved);
  };

  return (
    <UserContext.Provider value={{ profile, settings, refresh: load, updateSettings }}>
      {children}
    </UserContext.Provider>
  );
};

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUserContext must be used inside UserProvider');
  return ctx;
}
