import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { type Platillo } from '../types';
import AdminDashboard  from './AdminDashboard';
import AdminHistorial  from './AdminHistorial';
import AdminInventario from './AdminInventario';
import Boton            from './ui/Boton';
import Insignia         from './ui/Insignia';
import Tarjeta          from './ui/Tarjeta';
import EncabezadoPagina from './ui/EncabezadoPagina';
import EstadoVacio      from './ui/EstadoVacio';
import {
  crearPlatillo, actualizarPlatillo, archivarPlatillo, reactivarPlatillo,
} from '../lib/platillosAdmin';

type SubVista = 'dashboard' | 'menu' | 'historial' | 'inventario';

const SUB_TABS: { id: SubVista; label: string }[] = [
  { id: 'dashboard',  label: 'Dashboard'      },
  { id: 'menu',       label: 'Gestión de Menú' },
  { id: 'historial',  label: 'Historial'       },
  { id: 'inventario', label: 'Inventario'      },
];

const CATEGORIAS      = ['Todos', 'Desayunos', 'Sánduches', 'Platos a la Carta', 'Parrilladas', 'Fast Food', 'Bebidas'];
const CATEGORIAS_FORM = CATEGORIAS.filter(c => c !== 'Todos');

interface FormState {
  platilloNombre:      string;
  platilloDescripcion: string;
  platilloPrecio:      string;
  platilloCategoria:   string;
  platilloImagenUrl:   string;
  platilloDisponible:  boolean;
}

const FORM_VACIO: FormState = {
  platilloNombre:      '',
  platilloDescripcion: '',
  platilloPrecio:      '',
  platilloCategoria:   'Platos a la Carta',
  platilloImagenUrl:   '',
  platilloDisponible:  true,
};

// ── Detección de híbridos ────────────────────────────────────────────────────
const PRE_MEN = 'Menestra con ';
const PRE_PAR = 'Parrillada Ferroviaria ';

function nombreVariacion(p: Platillo): string {
  if (p.platilloNombre.startsWith(PRE_MEN)) return p.platilloNombre.slice(PRE_MEN.length);
  const m = /^Parrillada Ferroviaria \(([^)]+)\)/.exec(p.platilloNombre);
  return m ? m[1] : p.platilloNombre;
}

type ItemGrid =
  | { tipo: 'individual'; platillo: Platillo }
  | { tipo: 'hibrido'; clave: string; nombreBase: string; variaciones: Platillo[] };

function estadoBadge(p: Platillo): { tono: 'exito' | 'aviso' | 'neutro'; texto: string } {
  if (p.platilloArchivado)   return { tono: 'neutro', texto: 'Archivado'  };
  if (!p.platilloDisponible) return { tono: 'aviso',  texto: 'Agotado'    };
  return                            { tono: 'exito',  texto: 'Disponible' };
}

// ── Toggle disponibilidad ────────────────────────────────────────────────────
function Toggle({ activo, onToggle }: { activo: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oro ${
        activo ? 'bg-exito' : 'bg-linea'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function AdminMenu() {
  const [subVista, setSubVista] = useState<SubVista>('dashboard');

  const [platillos, setPlatillos]                         = useState<Platillo[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todos');
  const [busqueda, setBusqueda]                           = useState('');
  const [cargando, setCargando]                           = useState(true);
  const [errorMsg, setErrorMsg]                           = useState<string | null>(null);

  const [verArchivados, setVerArchivados]       = useState(false);
  const [modalAbierto, setModalAbierto]         = useState(false);
  const [platilloEditando, setPlatilloEditando] = useState<Platillo | null>(null);
  const [form, setForm]                         = useState<FormState>(FORM_VACIO);
  const [formError, setFormError]               = useState<string | null>(null);
  const [guardandoForm, setGuardandoForm]       = useState(false);

  async function cargarPlatillos() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.from('platillos').select('*');
      if (error) { setErrorMsg(error.message); }
      else if (data) {
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
      .from('platillos').update({ platilloDisponible: !estadoActual }).eq('platilloId', platilloId);
    if (error) { setErrorMsg(`No se pudo actualizar: ${error.message}`); return; }
    setPlatillos(prev =>
      prev.map(p => p.platilloId === platilloId ? { ...p, platilloDisponible: !estadoActual } : p)
    );
  }

  function abrirNuevo() {
    setForm(FORM_VACIO); setFormError(null); setPlatilloEditando(null); setModalAbierto(true);
  }

  function abrirEditar(p: Platillo) {
    setForm({
      platilloNombre:      p.platilloNombre,
      platilloDescripcion: p.platilloDescripcion ?? '',
      platilloPrecio:      String(p.platilloPrecio),
      platilloCategoria:   p.platilloCategoria,
      platilloImagenUrl:   p.platilloImagenUrl ?? '',
      platilloDisponible:  p.platilloDisponible,
    });
    setFormError(null); setPlatilloEditando(p); setModalAbierto(true);
  }

  async function guardarForm() {
    if (!form.platilloNombre.trim()) {
      setFormError('El nombre es obligatorio. Escribe el nombre del platillo.');
      return;
    }
    setFormError(null);
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
    try { await archivarPlatillo(p.platilloId); await cargarPlatillos(); }
    catch (e: unknown) { setErrorMsg(e instanceof Error ? e.message : String(e)); }
  }

  async function handleReactivar(p: Platillo) {
    try { await reactivarPlatillo(p.platilloId); await cargarPlatillos(); }
    catch (e: unknown) { setErrorMsg(e instanceof Error ? e.message : String(e)); }
  }

  // ── Computados ───────────────────────────────────────────────────────────────
  const activosCount     = platillos.filter(p => !p.platilloArchivado).length;
  const disponiblesCount = platillos.filter(p => !p.platilloArchivado && p.platilloDisponible).length;
  const archivadosCount  = platillos.filter(p => p.platilloArchivado).length;

  const platillosBase = verArchivados
    ? platillos.filter(p =>  p.platilloArchivado)
    : platillos.filter(p => !p.platilloArchivado);

  const platillosBuscados = busqueda
    ? platillosBase.filter(p => p.platilloNombre.toLowerCase().includes(busqueda.toLowerCase()))
    : platillosBase;

  const platillosFiltrados = categoriaSeleccionada === 'Todos'
    ? platillosBuscados
    : platillosBuscados.filter(p => p.platilloCategoria === categoriaSeleccionada);

  const conteoPorCat: Record<string, number> = {};
  for (const p of platillosBase) {
    conteoPorCat[p.platilloCategoria] = (conteoPorCat[p.platilloCategoria] ?? 0) + 1;
  }

  const menestras    = platillosFiltrados.filter(p =>  p.platilloNombre.startsWith(PRE_MEN));
  const parrilladas  = platillosFiltrados.filter(p =>  p.platilloNombre.startsWith(PRE_PAR));
  const individuales = platillosFiltrados.filter(p => !p.platilloNombre.startsWith(PRE_MEN) && !p.platilloNombre.startsWith(PRE_PAR));

  const itemsGrid: ItemGrid[] = [
    ...(menestras.length   > 0 ? [{ tipo: 'hibrido' as const, clave: 'menestra',   nombreBase: 'Menestra del Día',       variaciones: menestras   }] : []),
    ...(parrilladas.length > 0 ? [{ tipo: 'hibrido' as const, clave: 'parrillada', nombreBase: 'Parrillada Ferroviaria', variaciones: parrilladas }] : []),
    ...individuales.map(p => ({ tipo: 'individual' as const, platillo: p })),
  ];

  // ── Tarjeta individual ───────────────────────────────────────────────────────
  function renderCardIndividual(p: Platillo) {
    const { tono, texto } = estadoBadge(p);
    return (
      <Tarjeta key={p.platilloId} className={`flex flex-col ${p.platilloArchivado ? 'opacity-60' : ''}`}>
        <div className="px-3 pt-3">
          {p.platilloImagenUrl ? (
            <img src={p.platilloImagenUrl} alt={p.platilloNombre} className="w-full aspect-[4/3] object-cover rounded-lg" />
          ) : (
            <div className="w-full aspect-[4/3] bg-linea-suave rounded-lg flex items-center justify-center">
              <span className="text-2xl text-tinta-suave">🍽</span>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-2 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-medium text-tinta leading-snug">{p.platilloNombre}</h3>
            <Insignia tono={tono} className="shrink-0 mt-0.5">{texto}</Insignia>
          </div>
          <p className="text-[11px] text-tinta-suave">{p.platilloCategoria}</p>
          <div className="flex items-baseline gap-1.5 pt-1">
            <span className="text-[11px] text-tinta-media">Precio</span>
            <span className="text-base font-medium text-oro-tinta">${Number(p.platilloPrecio).toFixed(2)}</span>
          </div>
        </div>

        {!p.platilloArchivado && !verArchivados && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <Toggle activo={p.platilloDisponible} onToggle={() => conmutarDisponibilidad(p.platilloId, p.platilloDisponible)} />
            <span className="text-xs text-tinta-media">{p.platilloDisponible ? 'Disponible' : 'Agotado'}</span>
          </div>
        )}

        <div className="border-t border-linea-suave px-4 py-3 flex items-center gap-2">
          {p.platilloArchivado ? (
            <Boton variante="secundario" tamanio="sm" onClick={() => handleReactivar(p)} className="flex-1">Reactivar</Boton>
          ) : (
            <>
              <Boton variante="secundario" tamanio="sm" onClick={() => abrirEditar(p)} className="flex-1">Editar</Boton>
              <Boton variante="texto"      tamanio="sm" onClick={() => handleArchivar(p)}>Archivar</Boton>
            </>
          )}
        </div>
      </Tarjeta>
    );
  }

  // ── Tarjeta híbrida ──────────────────────────────────────────────────────────
  function renderCardHibrida(item: Extract<ItemGrid, { tipo: 'hibrido' }>) {
    const MAX = 3;
    return (
      <Tarjeta key={item.clave} className="flex flex-col">
        <div className="px-3 pt-3">
          <div className="w-full aspect-[4/3] bg-linea-suave rounded-lg flex items-center justify-center">
            <span className="text-2xl text-tinta-suave">🍽</span>
          </div>
        </div>

        <div className="px-4 pt-3 pb-2 flex-1">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-medium text-tinta leading-snug">{item.nombreBase}</h3>
            <Insignia tono="neutro" className="shrink-0 mt-0.5">{item.variaciones.length} variaciones</Insignia>
          </div>
          <div className="space-y-1">
            {item.variaciones.slice(0, MAX).map(v => (
              <div key={v.platilloId} className="flex items-center justify-between px-2 py-1.5 bg-linea-suave border-l-2 border-l-oro">
                <span className="text-xs text-tinta">{nombreVariacion(v)}</span>
                <span className="text-xs font-medium text-oro-tinta">${Number(v.platilloPrecio).toFixed(2)}</span>
              </div>
            ))}
            {item.variaciones.length > MAX && (
              <p className="text-xs text-tinta-suave pl-2 pt-0.5">y {item.variaciones.length - MAX} más</p>
            )}
          </div>
        </div>

        <div className="border-t border-linea-suave px-4 py-3 space-y-2">
          {item.variaciones.map(v => (
            <div key={v.platilloId} className="flex items-center gap-2">
              <span className="text-xs text-tinta-suave flex-1 truncate">{nombreVariacion(v)}</span>
              <Boton variante="secundario" tamanio="sm" onClick={() => abrirEditar(v)}>Editar</Boton>
              {v.platilloArchivado
                ? <Boton variante="texto" tamanio="sm" onClick={() => handleReactivar(v)}>Reactivar</Boton>
                : <Boton variante="texto" tamanio="sm" onClick={() => handleArchivar(v)}>Archivar</Boton>
              }
            </div>
          ))}
        </div>
      </Tarjeta>
    );
  }

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-lienzo min-h-screen">

      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 bg-peligro text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold hover:opacity-70 text-lg leading-none">✕</button>
        </div>
      )}

      {/* Sub-nav */}
      <div className="bg-tarjeta border-b border-linea flex overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubVista(tab.id)}
            className={`px-4 sm:px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 border-b-2 -mb-px ${
              subVista === tab.id
                ? 'border-oro text-tinta'
                : 'border-transparent text-tinta-suave hover:text-tinta-media'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-componentes ya migrados / pendientes de fase siguiente */}
      {subVista === 'historial'  && <AdminHistorial />}
      {subVista === 'inventario' && <AdminInventario />}
      {subVista === 'dashboard'  && <AdminDashboard />}

      {/* ══ Gestión de Menú ══ */}
      {subVista === 'menu' && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {cargando ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <p className="text-tinta-media text-sm">Cargando menú…</p>
            </div>
          ) : (
            <>
              <EncabezadoPagina
                titulo="Gestión de menú"
                subtitulo="Crea, edita, archiva y activa platillos"
                metadatos={`${activosCount} platillos · ${disponiblesCount} disponibles${archivadosCount > 0 ? ` · ${archivadosCount} archivados` : ''}`}
                acciones={
                  !verArchivados
                    ? <Boton variante="primario" onClick={abrirNuevo}>+ Nuevo platillo</Boton>
                    : undefined
                }
              />

              {/* Buscador + toggle archivados */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="relative w-full sm:max-w-[560px]">
                  <input
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar platillo…"
                    className="w-full pl-4 pr-9 py-2 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
                  />
                  <span className="absolute right-3 top-2.5 text-tinta-suave pointer-events-none text-sm">🔍</span>
                </div>
                <button
                  onClick={() => { setVerArchivados(v => !v); setCategoriaSeleccionada('Todos'); }}
                  className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors border whitespace-nowrap ${
                    verArchivados
                      ? 'bg-oro-tinte border-oro-borde text-oro-tinta'
                      : 'bg-tarjeta border-linea text-tinta-media hover:bg-linea-suave'
                  }`}
                >
                  {verArchivados ? 'Ocultar archivados' : 'Ver archivados'}
                </button>
              </div>

              {/* Chips de categoría */}
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => {
                  const count = cat === 'Todos' ? platillosBase.length : (conteoPorCat[cat] ?? 0);
                  const activo = categoriaSeleccionada === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoriaSeleccionada(cat)}
                      className={`min-h-[36px] px-3 py-1 text-sm font-medium rounded-lg border transition-colors duration-150 ${
                        activo
                          ? 'bg-oro text-carbon border-oro'
                          : 'bg-tarjeta border-linea text-tinta hover:bg-linea-suave'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Grid */}
              {platillosFiltrados.length === 0 ? (
                <EstadoVacio
                  icono="🍽"
                  titulo={verArchivados ? 'No hay platillos archivados' : 'No hay platillos en esta categoría'}
                  descripcion={busqueda ? `Sin resultados para "${busqueda}"` : undefined}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {itemsGrid.map(item =>
                    item.tipo === 'individual'
                      ? renderCardIndividual(item.platillo)
                      : renderCardHibrida(item)
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Build ID */}
      <p className="text-[10px] text-tinta-suave/40 text-center py-3 select-none">{__BUILD_ID__}</p>

      {/* Modal platillo */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-carbon/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setModalAbierto(false)}
          onKeyDown={e => e.key === 'Escape' && setModalAbierto(false)}
        >
          <div
            className="bg-tarjeta rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-[560px] flex flex-col overflow-hidden max-h-[95svh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-linea shrink-0">
              <h3 className="text-[16px] font-medium text-tinta">
                {platilloEditando ? 'Editar platillo' : 'Nuevo platillo'}
              </h3>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <p className="text-xs text-tinta-media bg-oro-tinte border border-oro-borde rounded-lg px-3 py-2 leading-relaxed">
                Para híbridos usa exactamente:
                <span className="font-medium"> 'Menestra con &lt;Carne&gt;'</span> o
                <span className="font-medium"> 'Parrillada Ferroviaria (&lt;Carne&gt;)'</span>
              </p>

              <div>
                <label className="block text-[12px] font-medium text-tinta-media mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.platilloNombre}
                  onChange={e => { setForm(p => ({ ...p, platilloNombre: e.target.value })); setFormError(null); }}
                  className="w-full h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
                  placeholder="Ej. Menestra con Pollo"
                />
                {formError && <p className="text-[12px] text-peligro mt-1">{formError}</p>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-tinta-media mb-1">Descripción</label>
                <textarea
                  value={form.platilloDescripcion}
                  onChange={e => setForm(p => ({ ...p, platilloDescripcion: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro resize-none text-sm"
                  placeholder="Descripción breve del platillo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-tinta-media mb-1">Precio ($)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.platilloPrecio}
                    onChange={e => setForm(p => ({ ...p, platilloPrecio: e.target.value }))}
                    className="w-full h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-tinta-media mb-1">Categoría</label>
                  <select
                    value={form.platilloCategoria}
                    onChange={e => setForm(p => ({ ...p, platilloCategoria: e.target.value }))}
                    className="w-full h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm bg-white"
                  >
                    {CATEGORIAS_FORM.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-tinta-media mb-1">URL de Imagen</label>
                <input
                  type="text"
                  value={form.platilloImagenUrl}
                  onChange={e => setForm(p => ({ ...p, platilloImagenUrl: e.target.value }))}
                  className="w-full h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
                  placeholder="https://…"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.platilloDisponible}
                  onChange={e => setForm(p => ({ ...p, platilloDisponible: e.target.checked }))}
                  className="w-4 h-4 accent-oro"
                />
                <span className="text-sm text-tinta">Disponible al crear</span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-linea flex justify-end gap-3 shrink-0">
              <Boton variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Boton>
              <Boton variante="primario"   onClick={guardarForm} disabled={guardandoForm}>
                {guardandoForm ? 'Guardando…' : 'Guardar platillo'}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
