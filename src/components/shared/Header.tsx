import React from 'react';
import { Link } from 'react-router-dom';

export const Header: React.FC = () => (
  <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
    <Link to="/" className="font-black tracking-tight">Piano Trainer</Link>
    <nav className="flex gap-4 text-sm">
      <Link to="/lessons">Lições</Link>
      <Link to="/analytics">Analytics</Link>
      <Link to="/settings">Configurações</Link>
    </nav>
  </header>
);
