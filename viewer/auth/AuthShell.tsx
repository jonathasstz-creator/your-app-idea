import React, { useState } from 'react';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

type View = 'login' | 'register';

interface Props {
  onAuthenticated: () => void;
}

const AuthShell: React.FC<Props> = ({ onAuthenticated }) => {
  const [view, setView] = useState<View>('login');

  return view === 'login'
    ? <LoginPage onSuccess={onAuthenticated} onNavigate={() => setView('register')} />
    : <RegisterPage onSuccess={onAuthenticated} onNavigate={() => setView('login')} />;
};

export default AuthShell;
