import React, { useState } from 'react';
import { Button } from '../shared/Button';
import { useAuthContext } from '../../contexts/AuthContext';

export const RegisterForm: React.FC = () => {
  const { register, isLoading } = useAuthContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    await register(name, email, password);
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <input placeholder="Nome" className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Email" className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Senha" className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        Aceito os termos
      </label>
      <Button type="submit" disabled={isLoading || !accepted}>{isLoading ? 'Criando...' : 'Criar conta'}</Button>
    </form>
  );
};
