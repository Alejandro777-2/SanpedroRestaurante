import { supabase } from '../supabaseClient';
import type { Perfil } from '../types';

export async function iniciarSesion(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut();
}

export async function obtenerPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('perfilId', userId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  return data as Perfil | null;
}
