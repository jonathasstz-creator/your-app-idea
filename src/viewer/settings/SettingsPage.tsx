import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  User as UserIcon,
  KeyRound,
  Mail,
  Shield,
  Star,
  HelpCircle,
  LogOut,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { authService } from '../auth/authService';

type Props = { onBack: () => void };

type ProfileVM = {
  email: string;
  fullName: string;
  emailVerified: boolean;
  planLabel: string;
};

const D = 0.2;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: D } },
};

function initialsFrom(nameOrEmail: string) {
  const raw = (nameOrEmail || '').trim();
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0].includes('@')) return parts[0][0].toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

type Notice = { type: 'ok' | 'err'; msg: string } | null;

export function SettingsPage({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileVM | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [nameDraft, setNameDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');

  const avatar = useMemo(
    () => initialsFrom(profile?.fullName || profile?.email || '?'),
    [profile],
  );

  const pushNotice = (type: 'ok' | 'err', msg: string) => {
    setNotice({ type, msg });
    window.setTimeout(() => setNotice(null), 3500);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const user = await authService.getUser();
        if (!alive) return;
        if (!user) {
          setLoading(false);
          pushNotice('err', 'Você precisa estar logado para acessar as configurações.');
          return;
        }
        const fullName = (user.user_metadata?.full_name as string | undefined) ?? '';
        const email = user.email ?? '';
        const emailVerified = Boolean((user as any).email_confirmed_at);
        const vm: ProfileVM = { email, fullName, emailVerified, planLabel: 'Free' };
        setProfile(vm);
        setNameDraft(fullName);
        setEmailDraft(email);
      } catch (e: any) {
        if (alive) pushNotice('err', e?.message ?? 'Erro ao carregar perfil.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const onSaveName = async () => {
    try {
      const trimmed = nameDraft.trim();
      await authService.updateDisplayName(trimmed);
      setProfile((p) => (p ? { ...p, fullName: trimmed } : p));
      window.dispatchEvent(new CustomEvent('profile:updated', { detail: { full_name: trimmed } }));
      pushNotice('ok', 'Nome atualizado.');
    } catch (e: any) {
      pushNotice('err', e?.message ?? 'Não foi possível atualizar o nome.');
    }
  };

  const onChangeEmail = async () => {
    try {
      await authService.updateEmail(emailDraft);
      setProfile((p) => (p ? { ...p, email: emailDraft.trim() } : p));
      window.dispatchEvent(new CustomEvent('profile:updated', { detail: { email: emailDraft.trim() } }));
      pushNotice('ok', 'E-mail atualizado. Confirme no inbox se solicitado.');
      setShowEmailForm(false);
    } catch (e: any) {
      pushNotice('err', e?.message ?? 'Não foi possível atualizar o e-mail.');
    }
  };

  const onChangePassword = async () => {
    if (pwd1.trim().length < 8) {
      pushNotice('err', 'Use uma senha com pelo menos 8 caracteres.');
      return;
    }
    if (pwd1 !== pwd2) {
      pushNotice('err', 'As senhas não conferem.');
      return;
    }
    try {
      await authService.updatePassword(pwd1);
      pushNotice('ok', 'Senha atualizada.');
      setPwd1('');
      setPwd2('');
      setShowPasswordForm(false);
    } catch (e: any) {
      pushNotice('err', e?.message ?? 'Não foi possível atualizar a senha.');
    }
  };

  const onLogout = async () => {
    try {
      await authService.logout();
      window.dispatchEvent(new CustomEvent('auth:logout'));
    } catch (e: any) {
      pushNotice('err', e?.message ?? 'Não foi possível sair.');
    }
  };

  return (
    <div className="h-full w-full bg-[#05060f] text-slate-100 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10">
        {/* Header sticky */}
        <div
          className="sticky top-0 z-10 backdrop-blur border-b border-slate-800/60 -mx-4 px-4"
          style={{ background: 'rgba(5,6,15,0.85)' }}
        >
          <div className="h-14 flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
            >
              <span className="text-lg leading-none">←</span>
              <span className="text-sm font-medium">Voltar</span>
            </button>
            <div className="text-sm font-semibold tracking-wide">Configurações</div>
            <div className="w-16" />
          </div>
        </div>

        {/* Toast notice */}
        <AnimatePresence>
          {notice && (
            <motion.div
              key="notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: D }}
              className={`mt-4 rounded-2xl border px-4 py-3 flex items-start gap-3 ${
                notice.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-rose-500/30 bg-rose-500/10'
              }`}
            >
              {notice.type === 'ok' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-300 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-300 mt-0.5 shrink-0" />
              )}
              <div className="text-sm text-slate-100/90">{notice.msg}</div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="mt-6 space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ── PERFIL ── */}
          <motion.section
            variants={sectionVariants}
            className="rounded-2xl border border-slate-800 bg-slate-900/30"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Perfil</span>
            </div>

            {loading ? (
              <div className="px-5 pb-5 space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-800/70 animate-pulse" />
                <div className="h-4 w-2/3 rounded-lg bg-slate-800/70 animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-slate-800/70 animate-pulse" />
              </div>
            ) : (
              <div className="px-5 pb-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm"
                  >
                    {avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">
                      {profile?.fullName || <span className="text-slate-500 italic">Seu nome (opcional)</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{profile?.email}</div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full border border-slate-700 text-slate-400 shrink-0">
                    Iniciante
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] text-slate-500 font-medium">Nome completo</label>
                  <div className="flex gap-2">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Ex: João Silva"
                      className="flex-1 h-11 rounded-xl bg-[#05060f] border border-slate-800 px-3 text-sm text-slate-100 outline-none focus:border-slate-600 transition-colors placeholder:text-slate-600"
                      autoComplete="name"
                    />
                    <button
                      onClick={onSaveName}
                      className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors text-sm font-medium text-slate-200"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.section>

          {/* ── CONTA ── */}
          <motion.section
            variants={sectionVariants}
            className="rounded-2xl border border-slate-800 bg-slate-900/30"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Conta</span>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {/* Email row */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-800/60 bg-[#05060f]/40 px-4 py-3">
                <Mail className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">
                    {profile?.email ?? '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {profile?.emailVerified ? '✓ Verificado' : 'Não verificado'}
                  </div>
                </div>
              </div>

              {/* Alterar e-mail */}
              <button
                onClick={() => { setShowEmailForm((v) => !v); setShowPasswordForm(false); }}
                className="w-full h-11 rounded-xl bg-[#05060f]/60 border border-slate-800 hover:border-slate-700 transition-colors text-sm font-medium text-slate-200 flex items-center justify-between px-4"
              >
                <span>Alterar e-mail</span>
                <ChevronRight
                  className="w-4 h-4 text-slate-500 transition-transform duration-200"
                  style={{ transform: showEmailForm ? 'rotate(90deg)' : 'rotate(0deg)' }}
                />
              </button>

              <AnimatePresence>
                {showEmailForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: D }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-slate-800 bg-[#05060f]/60 p-4 space-y-3">
                      <label className="text-[11px] text-slate-500 font-medium">Novo e-mail</label>
                      <input
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        className="w-full h-11 rounded-xl bg-[#05060f] border border-slate-800 px-3 text-sm text-slate-100 outline-none focus:border-slate-600 transition-colors"
                        autoComplete="email"
                        inputMode="email"
                        type="email"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={onChangeEmail}
                          className="h-11 px-4 rounded-xl bg-slate-200 text-slate-950 hover:bg-white transition-colors text-sm font-semibold"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setShowEmailForm(false)}
                          className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors text-sm font-medium text-slate-200"
                        >
                          Cancelar
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Pode ser necessário confirmar no inbox para efetivar a alteração.
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Alterar senha */}
              <button
                onClick={() => { setShowPasswordForm((v) => !v); setShowEmailForm(false); }}
                className="w-full h-11 rounded-xl bg-[#05060f]/60 border border-slate-800 hover:border-slate-700 transition-colors text-sm font-medium text-slate-200 flex items-center justify-between px-4"
              >
                <span>Alterar senha</span>
                <ChevronRight
                  className="w-4 h-4 text-slate-500 transition-transform duration-200"
                  style={{ transform: showPasswordForm ? 'rotate(90deg)' : 'rotate(0deg)' }}
                />
              </button>

              <AnimatePresence>
                {showPasswordForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: D }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-slate-800 bg-[#05060f]/60 p-4 space-y-3">
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-500 font-medium">Nova senha</label>
                        <input
                          value={pwd1}
                          onChange={(e) => setPwd1(e.target.value)}
                          type="password"
                          className="w-full h-11 rounded-xl bg-[#05060f] border border-slate-800 px-3 text-sm text-slate-100 outline-none focus:border-slate-600 transition-colors"
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-500 font-medium">Confirmar senha</label>
                        <input
                          value={pwd2}
                          onChange={(e) => setPwd2(e.target.value)}
                          type="password"
                          className="w-full h-11 rounded-xl bg-[#05060f] border border-slate-800 px-3 text-sm text-slate-100 outline-none focus:border-slate-600 transition-colors"
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={onChangePassword}
                          className="h-11 px-4 rounded-xl bg-slate-200 text-slate-950 hover:bg-white transition-colors text-sm font-semibold"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setShowPasswordForm(false)}
                          className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors text-sm font-medium text-slate-200"
                        >
                          Cancelar
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500">Mínimo de 8 caracteres.</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-px bg-slate-800/80" />

              <button
                onClick={onLogout}
                className="w-full h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 transition-colors text-sm font-semibold text-rose-300 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sair da conta
              </button>
            </div>
          </motion.section>

          {/* ── SEGURANÇA ── */}
          <motion.section
            variants={sectionVariants}
            className="rounded-2xl border border-slate-800 bg-slate-900/30"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Segurança</span>
            </div>
            <div className="px-5 pb-5 space-y-2">
              {[
                { label: 'Sessões ativas' },
                { label: 'Passkey' },
              ].map(({ label }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-[#05060f]/40 px-4 py-3 opacity-60"
                >
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-[11px] text-slate-500">em breve</span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ── ASSINATURA ── */}
          <motion.section
            variants={sectionVariants}
            className="rounded-2xl border border-slate-800 bg-slate-900/30"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <Star className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Assinatura</span>
            </div>
            <div className="px-5 pb-5 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-[#05060f]/40 px-4 py-3">
                <span className="text-sm text-slate-200">Plano atual</span>
                <span className="text-[11px] px-2 py-1 rounded-full border border-slate-700 text-slate-400">
                  {profile?.planLabel ?? 'Free'}
                </span>
              </div>
              {[
                'Gerenciar assinatura',
                'Restaurar compras',
              ].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-[#05060f]/40 px-4 py-3 opacity-50"
                >
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-[11px] text-slate-500">placeholder</span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ── AJUDA ── */}
          <motion.section
            variants={sectionVariants}
            className="rounded-2xl border border-slate-800 bg-slate-900/30"
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Ajuda</span>
            </div>
            <div className="px-5 pb-5 space-y-2">
              {['FAQ', 'Suporte', 'Reportar bug'].map((label) => (
                <button
                  key={label}
                  onClick={() => pushNotice('ok', `${label}: em breve`)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-800/60 bg-[#05060f]/40 hover:bg-slate-900/50 transition-colors px-4 py-3"
                >
                  <span className="text-sm text-slate-300">{label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              ))}
            </div>
          </motion.section>
        </motion.div>
      </div>
    </div>
  );
}
