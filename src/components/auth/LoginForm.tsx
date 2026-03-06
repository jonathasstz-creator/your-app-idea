import React, { useState } from 'react';
import { Button } from '../shared/Button';
import { useAuthContext } from '../../contexts/AuthContext';

export const LoginForm: React.FC = () => {
  const { login, isLoading } = useAuthContext();
  const [email, setEmail] = useState('joao@example.com');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm mb-1">Senha</label>
        <input type="password" className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={isLoading}>{isLoading ? 'Entrando...' : 'Entrar'}</Button>
    </form>
  );
};
