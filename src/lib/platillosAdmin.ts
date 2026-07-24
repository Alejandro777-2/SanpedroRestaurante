import { supabase } from '../supabaseClient';
import type { Platillo } from '../types';

export async function crearPlatillo(datos: Omit<Platillo, 'platilloId'>): Promise<void> {
  const { error } = await supabase.from('platillos').insert(datos);
  if (error) throw new Error(`No se pudo crear el platillo: ${error.message}`);
}

export async function actualizarPlatillo(id: string, cambios: Partial<Platillo>): Promise<void> {
  const { error } = await supabase.from('platillos').update(cambios).eq('platilloId', id);
  if (error) throw new Error(`No se pudo actualizar el platillo: ${error.message}`);
}

export async function archivarPlatillo(id: string): Promise<void> {
  const { error } = await supabase
    .from('platillos')
    .update({ platilloArchivado: true })
    .eq('platilloId', id);
  if (error) throw new Error(`No se pudo archivar el platillo: ${error.message}`);
}

export async function reactivarPlatillo(id: string): Promise<void> {
  const { error } = await supabase
    .from('platillos')
    .update({ platilloArchivado: false })
    .eq('platilloId', id);
  if (error) throw new Error(`No se pudo reactivar el platillo: ${error.message}`);
}
