import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import LessonsHubPage from './pages/LessonsHubPage';
import PracticeSessionPage from './pages/PracticeSessionPage';
import SessionResultsPage from './pages/SessionResultsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import { AuthProvider } from './contexts/AuthContext';
import { UserProvider } from './contexts/UserContext';
import { PracticeProvider } from './contexts/PracticeContext';

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <UserProvider>
        <PracticeProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/lessons" element={<LessonsHubPage />} />
            <Route path="/practice/:lessonId" element={<PracticeSessionPage />} />
            <Route path="/results/:sessionId" element={<SessionResultsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<DashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PracticeProvider>
      </UserProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
