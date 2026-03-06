import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from './authService';

interface Props {
  onSuccess: () => void;
  onNavigate: (page: 'login') => void;
}

const InputField = ({
  label, icon: Icon, type, value, onChange, placeholder,
}: {
  label: string; icon: React.ElementType; type: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string;
}) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl opacity-0 group-focus-within:opacity-20 transition duration-500 blur" />
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
        <input
          type={type} value={value} onChange={onChange} required
          className="w-full bg-[#05060f] border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:border-indigo-500/50 outline-none transition-all font-medium"
          placeholder={placeholder}
        />
      </div>
    </div>
  </div>
);

const RegisterPage: React.FC<Props> = ({ onSuccess, onNavigate }) => {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.register(name, email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#05060f] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#05060f] to-[#05060f] z-0" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tighter">CRIAR CONTA</h1>
          <p className="text-slate-400 font-medium text-sm">Junte-se a milhares de músicos.</p>
        </div>

        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-20 rounded-2xl blur-xl transition duration-500 group-hover:opacity-30" />
          <div className="relative bg-[#0d0e1c] border border-slate-800 p-8 rounded-2xl shadow-2xl">
            <form onSubmit={handleRegister} className="space-y-5">
              <InputField label="Nome Completo" icon={User}  type="text"     value={name}     onChange={e => setName(e.target.value)}     placeholder="Seu nome" />
              <InputField label="Email"          icon={Mail}  type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="seu@email.com" />
              <InputField label="Senha"          icon={Lock}  type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />

              {error && (
                <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="group/btn relative w-full py-4 mt-2 rounded-xl font-black text-sm uppercase tracking-widest text-white overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600" />
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                <div className="relative flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Começar Agora'}
                </div>
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-500 text-xs font-medium">
                Já tem conta?{' '}
                <button onClick={() => onNavigate('login')} className="text-indigo-400 font-bold hover:text-indigo-300 transition-colors ml-1">
                  Fazer Login
                </button>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
