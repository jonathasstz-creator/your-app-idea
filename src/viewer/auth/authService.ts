import { supabase } from './supabaseClient';
import { AuthProfile } from './types';

function toFriendlyError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('already been registered') || message.includes('User already registered'))
    return 'Este e-mail já está cadastrado.';
  if (message.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (message.includes('rate limit') || message.includes('too many requests'))
    return 'Muitas tentativas. Aguarde alguns minutos.';
  return 'Ocorreu um erro. Tente novamente.';
}

export const authService = {
  async login(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(toFriendlyError(error.message));
  },

  async register(fullName: string, email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(toFriendlyError(error.message));
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(toFriendlyError(error.message));
  },

  async getProfile(userId: string): Promise<AuthProfile | null> {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', userId)
      .single();
    return data ?? null;
  },

  async getSession() {
    return supabase.auth.getSession();
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(toFriendlyError(error.message));
    return data.user ?? null;
  },

  async updateEmail(newEmail: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) throw new Error(toFriendlyError(error.message));
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(toFriendlyError(error.message));
  },

  async updateDisplayName(name: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (error) throw new Error(toFriendlyError(error.message));
  },
};
