import React from 'react';
import { Link } from 'react-router-dom';
import { RegisterForm } from '../components/auth/RegisterForm';

const RegisterPage: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
    <div className="w-full max-w-md p-6 rounded-2xl border border-slate-800 bg-slate-900/70">
      <h1 className="text-2xl font-bold mb-4">Criar conta</h1>
      <RegisterForm />
      <div className="text-sm text-slate-400 mt-4">
        Já tem conta? <Link to="/login" className="text-indigo-400">Entrar</Link>
      </div>
    </div>
  </div>
);

export default RegisterPage;
