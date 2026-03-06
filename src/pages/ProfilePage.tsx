import React from 'react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { useUserContext } from '../contexts/UserContext';
import { ProfileCard } from '../components/profile/ProfileCard';
import { StatsWidget } from '../components/profile/StatsWidget';

const ProfilePage: React.FC = () => {
  const { profile } = useUserContext();
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 space-y-6">
          <ProfileCard profile={profile} />
          <StatsWidget profile={profile} />
        </main>
      </div>
    </div>
  );
};

export default ProfilePage;
