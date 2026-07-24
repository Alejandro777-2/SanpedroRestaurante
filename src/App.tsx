import { useState } from 'react';
import { SesionProvider, useSesion } from './context/SesionContext';
import MenuMesero from './components/MenuMesero';
import AdminMenu from './components/AdminMenu';
import Login from './components/Login';

function Spinner() {
  return (
    <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-sanpedro-gold border-t-transparent rounded-full animate-spin" />
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
      <nav className="bg-sanpedro-dark flex items-center shrink-0">
        {esAdmin && (
          <>
            <button
              onClick={() => setVista('mesero')}
              className={`px-3 sm:px-6 py-3 min-h-[44px] text-sm font-semibold transition-colors duration-150 whitespace-nowrap ${
                vista === 'mesero'
                  ? 'bg-sanpedro-gold text-sanpedro-dark'
                  : 'text-gray-400 hover:text-sanpedro-gold'
              }`}
            >
              Vista Mesero
            </button>
            <button
              onClick={() => setVista('admin')}
              className={`px-3 sm:px-6 py-3 min-h-[44px] text-sm font-semibold transition-colors duration-150 whitespace-nowrap ${
                vista === 'admin'
                  ? 'bg-sanpedro-gold text-sanpedro-dark'
                  : 'text-gray-400 hover:text-sanpedro-gold'
              }`}
            >
              Administración
            </button>
          </>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4">
          <span className="text-sm text-sanpedro-gold font-medium truncate max-w-[80px] sm:max-w-none">{perfil.perfilNombre}</span>
          <button
            onClick={cerrarSesion}
            className="text-xs text-gray-400 hover:text-white font-semibold transition-colors px-2 sm:px-3 py-1.5 rounded-lg hover:bg-white/10 whitespace-nowrap"
          >
            <span className="sm:hidden">Salir</span>
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {esAdmin && vista === 'admin'
        ? <AdminMenu />
        : <MenuMesero meseroId={perfil.perfilId} />
      }
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
