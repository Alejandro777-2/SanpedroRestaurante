import { useState } from 'react';
import { iniciarSesion } from '../lib/auth';

function mensajeError(err: unknown): string {
  if (!(err instanceof Error)) return 'Error desconocido. Intenta de nuevo.';
  const msg = err.message.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Debes confirmar tu correo electrónico antes de ingresar.';
  }
  if (msg.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  }
  return 'No se pudo iniciar sesión. Verifica tu conexión e intenta de nuevo.';
}

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await iniciarSesion(email, password);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-svh bg-[#FAFAF6] flex items-center justify-center px-4">
      <div className="w-full max-w-[380px] bg-white rounded-xl border border-stone-200 border-t-[3px] border-t-sanpedro-gold shadow-sm overflow-hidden">

        {/* Marca */}
        <div className="px-8 pt-9 pb-7 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-sanpedro-gold-dark font-medium">
            Restaurante
          </p>
          <h1 className="text-4xl font-medium text-sanpedro-dark tracking-[-0.02em] mt-1">
            San Pedro
          </h1>
          <div className="w-10 h-px bg-sanpedro-gold/40 mx-auto mt-5" />
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200/70 text-red-700 text-sm rounded-lg px-3.5 py-2.5 leading-relaxed">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-stone-400 mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
              className="w-full px-4 h-11 rounded-lg border border-stone-200 focus:outline-none focus:border-sanpedro-gold focus:ring-2 focus:ring-sanpedro-gold/20 transition-colors duration-200"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.12em] text-stone-400 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-4 h-11 rounded-lg border border-stone-200 focus:outline-none focus:border-sanpedro-gold focus:ring-2 focus:ring-sanpedro-gold/20 transition-colors duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-medium h-11 rounded-lg transition-colors duration-200 tracking-wide disabled:opacity-60 mt-1"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>

        </form>
      </div>
    </div>
  );
}
