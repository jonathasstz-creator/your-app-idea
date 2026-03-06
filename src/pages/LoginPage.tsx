import React from 'react';
import { Link } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';

const LoginPage: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
    <div className="w-full max-w-md p-6 rounded-2xl border border-slate-800 bg-slate-900/70">
      <h1 className="text-2xl font-bold mb-4">Entrar</h1>
      <LoginForm />
      <div className="text-sm text-slate-400 mt-4 flex justify-between">
        <Link to="/register" className="text-indigo-400">Criar conta</Link>
        <button className="text-slate-400" type="button">Esqueci a senha</button>
      </div>
    </div>
  </div>
);

export default LoginPage;
