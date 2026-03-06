import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, ChevronLeft, AlertCircle, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { authService } from './authService';

interface Props {
  onSuccess: () => void;
  onNavigate: (page: 'register') => void;
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
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl opacity-0 group-focus-within:opacity-20 transition duration-500 blur" />
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" size={18} />
        <input
          type={type} value={value} onChange={onChange} required
          className="w-full bg-[#05060f] border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:border-cyan-500/50 outline-none transition-all font-medium"
          placeholder={placeholder}
        />
      </div>
    </div>
  </div>
);

const LoginPage: React.FC<Props> = ({ onSuccess, onNavigate }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [forgotMode, setForgotMode]       = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError]     = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      await authService.resetPassword(forgotEmail);
      setForgotSuccess(true);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#05060f] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-2xl mx-auto mb-6 shadow-lg shadow-cyan-900/50">
            P
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">PIANO TRAINER</h1>
          <p className="text-slate-400 font-medium text-sm">
            {forgotMode ? 'Recupere o acesso à sua conta.' : 'Faça login para continuar sua jornada.'}
          </p>
        </div>

        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 opacity-20 rounded-2xl blur-xl transition duration-500 group-hover:opacity-30" />
          <div className="relative bg-[#0d0e1c] border border-slate-800 p-8 rounded-2xl shadow-2xl">
            <AnimatePresence mode="wait">
              {!forgotMode ? (
                <motion.form key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} onSubmit={handleLogin} className="space-y-6">
                  <InputField label="Email" icon={Mail} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

                  <div className="space-y-2">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Senha</label>
                      <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); setError(null); }}
                        className="text-[10px] text-cyan-400 font-bold hover:text-cyan-300 transition-colors uppercase tracking-widest">
                        Esqueci a senha
                      </button>
                    </div>
                    <div className="relative group/input">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl opacity-0 group-focus-within/input:opacity-20 transition duration-500 blur" />
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-cyan-400 transition-colors" size={18} />
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                          className="w-full bg-[#05060f] border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:border-cyan-500/50 outline-none transition-all font-medium"
                          placeholder="••••••••" />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold">
                      <AlertCircle size={16} /> {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading}
                    className="group/btn relative w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest text-white overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600" />
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                    <div className="relative flex items-center justify-center gap-2">
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <>Entrar <ArrowRight size={18} /></>}
                    </div>
                  </button>
                </motion.form>
              ) : (
                <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <button type="button" onClick={() => { setForgotMode(false); setForgotSuccess(false); setForgotError(null); }}
                    className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-6 group">
                    <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Voltar ao login</span>
                  </button>

                  {forgotSuccess ? (
                    <div className="flex flex-col items-center gap-4 py-4 text-center">
                      <CheckCircle2 size={48} className="text-emerald-400" />
                      <p className="text-white font-bold">Link enviado!</p>
                      <p className="text-slate-400 text-xs font-medium">
                        Verifique sua caixa de entrada em <span className="text-cyan-400">{forgotEmail}</span>.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleForgot} className="space-y-6">
                      <InputField label="Seu e-mail" icon={Mail} type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="seu@email.com" />
                      {forgotError && (
                        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold">
                          <AlertCircle size={16} /> {forgotError}
                        </div>
                      )}
                      <button type="submit" disabled={forgotLoading}
                        className="group/btn relative w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest text-white overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600" />
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        <div className="relative flex items-center justify-center gap-2">
                          {forgotLoading ? <Loader2 size={18} className="animate-spin" /> : 'Enviar link de recuperação'}
                        </div>
                      </button>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {!forgotMode && (
              <div className="mt-8 pt-8 border-t border-slate-800 text-center">
                <p className="text-slate-500 text-xs font-medium">
                  Não tem uma conta?{' '}
                  <button onClick={() => onNavigate('register')} className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors ml-1">
                    Criar conta grátis
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
