import { useState } from 'react';
import { SesionProvider, useSesion } from './context/SesionContext';
import MenuMesero from './components/MenuMesero';
import AdminMenu from './components/AdminMenu';
import Login from './components/Login';

function Spinner() {
  return (
    <div className="min-h-screen bg-lienzo flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-oro border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppInterna() {
  const { perfil, cerrarSesion } = useSesion();
  const [vista, setVista] = useState<'mesero' | 'admin'>(() =>
    perfil?.perfilRol === 'administrador' ? 'admin' : 'mesero'
  );

  if (!perfil) return <Spinner />;

  const esAdmin = perfil.perfilRol === 'administrador';

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Barra superior ── */}
      <nav className="bg-carbon flex items-center gap-1 px-3 shrink-0">
        {/* Monograma */}
        <div className="w-7 h-7 bg-oro text-carbon rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mr-1 select-none">
          SP
        </div>
        {/* Wordmark */}
        <span className="text-white/50 text-sm font-medium mr-3 whitespace-nowrap hidden sm:inline">
          San Pedro
        </span>

        {/* Pestañas de vista (solo admins) */}
        {esAdmin && (
          <>
            <button
              onClick={() => setVista('mesero')}
              className={`px-3 py-1.5 min-h-[44px] text-sm font-medium transition-colors duration-150 whitespace-nowrap rounded-lg ${
                vista === 'mesero'
                  ? 'bg-oro text-carbon'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Vista Mesero
            </button>
            <button
              onClick={() => setVista('admin')}
              className={`px-3 py-1.5 min-h-[44px] text-sm font-medium transition-colors duration-150 whitespace-nowrap rounded-lg ${
                vista === 'admin'
                  ? 'bg-oro text-carbon'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Administración
            </button>
          </>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2 px-2">
          <span className="text-sm text-white/50 font-medium truncate max-w-[80px] sm:max-w-none">
            {perfil.perfilNombre}
          </span>
          <button
            onClick={cerrarSesion}
            className="text-xs text-white/40 hover:text-white font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10 whitespace-nowrap min-h-[44px]"
          >
            <span className="sm:hidden">Salir</span>
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {/* ── Contenido ── */}
      <div className="flex-1 bg-lienzo overflow-auto">
        {esAdmin && vista === 'admin'
          ? <AdminMenu />
          : <MenuMesero meseroId={perfil.perfilId} />
        }
      </div>
    </div>
  );
}

function AppContent() {
  const { sesion, perfil, cargando } = useSesion();

  if (cargando || (sesion && !perfil)) return <Spinner />;
  if (!sesion) return <Login />;
  return <AppInterna />;
}

export default function App() {
  return (
    <SesionProvider>
      <AppContent />
    </SesionProvider>
  );
}
