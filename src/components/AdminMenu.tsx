import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { type Platillo } from '../types';
import AdminDashboard from './AdminDashboard';
import AdminHistorial from './AdminHistorial';
import AdminInventario from './AdminInventario';
import {
  crearPlatillo,
  actualizarPlatillo,
  archivarPlatillo,
  reactivarPlatillo,
} from '../lib/platillosAdmin';

type SubVista = 'dashboard' | 'menu' | 'historial' | 'inventario';

const SUB_TABS: { id: SubVista; label: string }[] = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'menu',       label: 'Gestión de Menú' },
  { id: 'historial',  label: 'Historial' },
  { id: 'inventario', label: 'Inventario' },
];

const CATEGORIAS      = ['Todos', 'Desayunos', 'Sánduches', 'Platos a la Carta', 'Parrilladas', 'Fast Food', 'Bebidas'];
const CATEGORIAS_FORM = CATEGORIAS.filter(c => c !== 'Todos');

interface FormState {
  platilloNombre: string;
  platilloDescripcion: string;
  platilloPrecio: string;
  platilloCategoria: string;
  platilloImagenUrl: string;
  platilloDisponible: boolean;
}

const FORM_VACIO: FormState = {
  platilloNombre: '',
  platilloDescripcion: '',
  platilloPrecio: '',
  platilloCategoria: 'Platos a la Carta',
  platilloImagenUrl: '',
  platilloDisponible: true,
};

function Toggle({ activo, onToggle }: { activo: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sanpedro-gold ${
        activo ? 'bg-green-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
          activo ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function AdminMenu() {
  const [subVista, setSubVista] = useState<SubVista>('dashboard');

  const [platillos, setPlatillos]                         = useState<Platillo[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todos');
  const [cargando, setCargando]                           = useState(true);
  const [errorMsg, setErrorMsg]                           = useState<string | null>(null);

  const [verArchivados, setVerArchivados]         = useState(false);
  const [modalAbierto, setModalAbierto]           = useState(false);
  const [platilloEditando, setPlatilloEditando]   = useState<Platillo | null>(null);
  const [form, setForm]                           = useState<FormState>(FORM_VACIO);
  const [guardandoForm, setGuardandoForm]         = useState(false);

  async function cargarPlatillos() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.from('platillos').select('*');
      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        const ordenados = [...(data as Platillo[])].sort((a, b) =>
          (a.platilloNombre ?? '').localeCompare(b.platilloNombre ?? '')
        );
        setPlatillos(ordenados);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargarPlatillos(); }, []);

  async function conmutarDisponibilidad(platilloId: string, estadoActual: boolean) {
    const { error } = await supabase
      .from('platillos')
      .update({ platilloDisponible: !estadoActual })
      .eq('platilloId', platilloId);
    if (error) {
      setErrorMsg(`No se pudo actualizar: ${error.message}`);
      return;
    }
    setPlatillos(prev =>
      prev.map(p => p.platilloId === platilloId ? { ...p, platilloDisponible: !estadoActual } : p)
    );
  }

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setPlatilloEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(p: Platillo) {
    setForm({
      platilloNombre:    p.platilloNombre,
      platilloDescripcion: p.platilloDescripcion ?? '',
      platilloPrecio:    String(p.platilloPrecio),
      platilloCategoria: p.platilloCategoria,
      platilloImagenUrl: p.platilloImagenUrl ?? '',
      platilloDisponible: p.platilloDisponible,
    });
    setPlatilloEditando(p);
    setModalAbierto(true);
  }

  async function guardarForm() {
    if (!form.platilloNombre.trim()) {
      setErrorMsg('El nombre del platillo es obligatorio.');
      return;
    }
    setGuardandoForm(true);
    try {
      if (platilloEditando) {
        await actualizarPlatillo(platilloEditando.platilloId, {
          platilloNombre:      form.platilloNombre.trim(),
          platilloDescripcion: form.platilloDescripcion.trim(),
          platilloPrecio:      parseFloat(form.platilloPrecio) || 0,
          platilloCategoria:   form.platilloCategoria,
          platilloImagenUrl:   form.platilloImagenUrl.trim() || null,
          platilloDisponible:  form.platilloDisponible,
        });
      } else {
        await crearPlatillo({
          platilloNombre:      form.platilloNombre.trim(),
          platilloDescripcion: form.platilloDescripcion.trim(),
          platilloPrecio:      parseFloat(form.platilloPrecio) || 0,
          platilloCategoria:   form.platilloCategoria,
          platilloImagenUrl:   form.platilloImagenUrl.trim() || null,
          platilloDisponible:  form.platilloDisponible,
          platilloArchivado:   false,
        });
      }
      setModalAbierto(false);
      await cargarPlatillos();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoForm(false);
    }
  }

  async function handleArchivar(p: Platillo) {
    if (!window.confirm(`¿Archivar "${p.platilloNombre}"? Ya no aparecerá en el menú del mesero.`)) return;
    try {
      await archivarPlatillo(p.platilloId);
      await cargarPlatillos();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleReactivar(p: Platillo) {
    try {
      await reactivarPlatillo(p.platilloId);
      await cargarPlatillos();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const platillosBase = verArchivados
    ? platillos.filter(p => p.platilloArchivado)
    : platillos.filter(p => !p.platilloArchivado);

  const platillosFiltrados = categoriaSeleccionada === 'Todos'
    ? platillosBase
    : platillosBase.filter(p => p.platilloCategoria === categoriaSeleccionada);

  const activosCount = platillos.filter(p => !p.platilloArchivado).length;

  return (
    <div className="min-h-screen bg-[#FAFAF6]">

      {/* Toast de error — se cierra manualmente */}
      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 bg-red-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold hover:text-red-300 text-lg leading-none">✕</button>
        </div>
      )}

      {/* ── Cabecera del panel ── */}
      <div className="bg-sanpedro-wood px-6 py-5">
        <p className="text-sanpedro-gold text-xs font-semibold tracking-[0.2em] uppercase mb-0.5">Panel de</p>
        <h1 className="text-2xl font-medium text-white tracking-tight">Administración del Menú</h1>
        <p className="text-sanpedro-gold/70 text-sm mt-0.5">{activosCount} platillos activos</p>
      </div>
      <div className="h-1 bg-gradient-to-r from-sanpedro-gold via-sanpedro-gold-dark to-sanpedro-gold" />

      {/* ── Sub-navegación ── */}
      <div className="flex overflow-x-auto border-b border-sanpedro-gold/20 bg-white">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubVista(tab.id)}
            className={`px-4 sm:px-6 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
              subVista === tab.id
                ? 'border-b-2 border-sanpedro-gold text-sanpedro-wood'
                : 'text-gray-400 hover:text-sanpedro-wood'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenido por pestaña ── */}
      {subVista === 'historial' ? (
        <AdminHistorial />
      ) : subVista === 'inventario' ? (
        <AdminInventario />
      ) : subVista === 'dashboard' ? (
        <AdminDashboard />
      ) : (
        <>
          {cargando ? (
            <div className="flex items-center justify-center min-h-[60vh] bg-[#FAFAF6]">
              <p className="text-sanpedro-wood font-medium tracking-wide">Cargando panel…</p>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-4">

              {/* ── Barra de filtros + acciones ── */}
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoriaSeleccionada(cat)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-150 ${
                        categoriaSeleccionada === cat
                          ? 'bg-sanpedro-wood text-sanpedro-gold'
                          : 'bg-sanpedro-wood-light text-sanpedro-wood hover:bg-sanpedro-gold/20'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setVerArchivados(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-150 ${
                      verArchivados
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-sanpedro-wood-light text-sanpedro-wood hover:bg-sanpedro-gold/20'
                    }`}
                  >
                    {verArchivados ? 'Ocultar archivados' : 'Ver archivados'}
                  </button>
                  {!verArchivados && (
                    <button
                      onClick={abrirNuevo}
                      className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-bold text-sm px-4 py-2 rounded-lg transition-colors duration-150"
                    >
                      + Nuevo Platillo
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400 font-medium">
                {platillosFiltrados.length} platillo(s){verArchivados ? ' archivados' : ''}
              </p>

              {/* ── Vista Desktop: Tabla ── */}
              <div className="hidden md:block rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-sanpedro-wood text-white text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                      <th className="text-left px-4 py-3 font-semibold">Platillo</th>
                      <th className="text-left px-4 py-3 font-semibold">Descripción</th>
                      <th className="text-right px-4 py-3 font-semibold">Precio</th>
                      {!verArchivados && <th className="text-center px-4 py-3 font-semibold">Disponible</th>}
                      <th className="text-center px-4 py-3 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {platillosFiltrados.map(p => (
                      <tr key={p.platilloId} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-stone-400 whitespace-nowrap">
                            {p.platilloCategoria}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-sanpedro-dark max-w-[180px]">
                          {p.platilloNombre}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs">
                          <span className="line-clamp-2">{p.platilloDescripcion || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sanpedro-wood whitespace-nowrap">
                          ${Number(p.platilloPrecio).toFixed(2)}
                        </td>
                        {!verArchivados && (
                          <td className="px-4 py-3 text-center">
                            <Toggle
                              activo={p.platilloDisponible}
                              onToggle={() => conmutarDisponibilidad(p.platilloId, p.platilloDisponible)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          {verArchivados ? (
                            <button
                              onClick={() => handleReactivar(p)}
                              className="text-xs font-semibold text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1 rounded-lg transition-colors"
                            >
                              Reactivar
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => abrirEditar(p)}
                                className="text-xs font-semibold text-sanpedro-wood hover:text-sanpedro-dark bg-sanpedro-wood-light hover:bg-sanpedro-gold/20 px-3 py-1 rounded-lg transition-colors"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleArchivar(p)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1 rounded-lg transition-colors"
                              >
                                Archivar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Vista Móvil: Tarjetas ── */}
              <div className="md:hidden space-y-3">
                {platillosFiltrados.map(p => (
                  <div
                    key={p.platilloId}
                    className="bg-white rounded-xl border border-stone-200 border-t-[3px] border-t-sanpedro-gold p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-400">
                          {p.platilloCategoria}
                        </span>
                        <h3 className="text-sm font-bold text-sanpedro-dark mt-1.5 leading-snug">{p.platilloNombre}</h3>
                        {p.platilloDescripcion && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.platilloDescripcion}</p>
                        )}
                      </div>
                      {!verArchivados && (
                        <Toggle
                          activo={p.platilloDisponible}
                          onToggle={() => conmutarDisponibilidad(p.platilloId, p.platilloDisponible)}
                        />
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
                      <span className="font-bold text-sanpedro-wood text-sm">${Number(p.platilloPrecio).toFixed(2)}</span>
                      <div className="flex gap-2">
                        {verArchivados ? (
                          <button
                            onClick={() => handleReactivar(p)}
                            className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-lg"
                          >
                            Reactivar
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => abrirEditar(p)}
                              className="text-xs font-semibold text-sanpedro-wood bg-sanpedro-wood-light px-3 py-1 rounded-lg"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleArchivar(p)}
                              className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-lg"
                            >
                              Archivar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {platillosFiltrados.length === 0 && !cargando && (
                <p className="text-center py-12 text-gray-400 text-sm">
                  {verArchivados ? 'No hay platillos archivados.' : 'No hay platillos en esta categoría.'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal: crear / editar platillo ── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-sanpedro-dark/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setModalAbierto(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col overflow-hidden max-h-[95svh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="bg-sanpedro-wood px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-white">
                {platilloEditando ? 'Editar Platillo' : 'Nuevo Platillo'}
              </h3>
            </div>
            <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60 shrink-0" />

            {/* Formulario */}
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">

              {/* Ayuda para híbridos */}
              <p className="text-xs text-sanpedro-wood bg-sanpedro-gold/10 border border-sanpedro-gold/30 rounded-lg px-3 py-2 leading-relaxed">
                Para sumar una variación a un grupo existente, usa el patrón exacto:
                <span className="font-semibold"> 'Menestra con &lt;Carne&gt;'</span> o
                <span className="font-semibold"> 'Parrillada Ferroviaria (&lt;Carne&gt;)'</span>,
                respetando mayúsculas.
              </p>

              <div>
                <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.platilloNombre}
                  onChange={e => setForm(prev => ({ ...prev, platilloNombre: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                  placeholder="Ej. Menestra con Pollo"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.platilloDescripcion}
                  onChange={e => setForm(prev => ({ ...prev, platilloDescripcion: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold resize-none"
                  placeholder="Descripción breve del platillo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.platilloPrecio}
                    onChange={e => setForm(prev => ({ ...prev, platilloPrecio: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                    Categoría
                  </label>
                  <select
                    value={form.platilloCategoria}
                    onChange={e => setForm(prev => ({ ...prev, platilloCategoria: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold bg-white"
                  >
                    {CATEGORIAS_FORM.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                  URL de Imagen
                </label>
                <input
                  type="text"
                  value={form.platilloImagenUrl}
                  onChange={e => setForm(prev => ({ ...prev, platilloImagenUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                  placeholder="https://..."
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.platilloDisponible}
                  onChange={e => setForm(prev => ({ ...prev, platilloDisponible: e.target.checked }))}
                  className="w-4 h-4 accent-sanpedro-gold"
                />
                <span className="text-sm font-semibold text-sanpedro-dark">Disponible al crear</span>
              </label>
            </div>

            {/* Pie */}
            <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setModalAbierto(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-sanpedro-wood transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarForm}
                disabled={guardandoForm}
                className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-bold text-sm px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {guardandoForm ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
