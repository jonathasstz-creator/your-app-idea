import React from 'react';
import { UserProfile } from '../../types/auth.types';

export const ProfileCard: React.FC<{ profile: UserProfile }> = ({ profile }) => (
  <div className="p-4 border border-slate-800 rounded-xl bg-slate-900/50 flex items-center gap-4">
    <img src={profile.avatar_url} alt={profile.name} className="w-16 h-16 rounded-full object-cover" />
    <div>
      <h3 className="text-lg font-semibold">{profile.name}</h3>
      <p className="text-slate-400 text-sm">{profile.email}</p>
      <p className="text-xs text-slate-500">Desde {new Date(profile.created_at).toLocaleDateString()}</p>
    </div>
  </div>
);
