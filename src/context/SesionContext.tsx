import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { cerrarSesion as _cerrarSesion, obtenerPerfil } from '../lib/auth';
import type { Perfil } from '../types';

interface SesionContextType {
  sesion: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  cerrarSesion: () => Promise<void>;
}

const SesionContext = createContext<SesionContextType | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Carga inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSesion(session);
      if (session) setPerfil(await obtenerPerfil(session.user.id));
      setCargando(false);
    });

    // Reacciona a login / logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSesion(session);
      if (session) {
        setPerfil(await obtenerPerfil(session.user.id));
      } else {
        setPerfil(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function cerrarSesion() {
    await _cerrarSesion();
  }

  return (
    <SesionContext.Provider value={{ sesion, perfil, cargando, cerrarSesion }}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return ctx;
}
