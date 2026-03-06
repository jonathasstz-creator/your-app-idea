import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/lessons', label: 'Lições' },
  { to: '/practice/lesson_001', label: 'Prática' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/settings', label: 'Settings' },
];

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <aside className="w-56 border-r border-slate-800 p-4 space-y-2 text-sm">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={`block px-3 py-2 rounded ${pathname === l.to ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
        >
          {l.label}
        </Link>
      ))}
    </aside>
  );
};
