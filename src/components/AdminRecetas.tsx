import { useEffect, useState } from 'react';
import {
  listarPlatillosConRecetas, listarIngredientesActivos,
  agregarReceta, actualizarCantidadReceta, eliminarReceta,
  type PlatilloConReceta, type IngredienteBase,
} from '../lib/inventario';

type Vista = 'porPlatillo' | 'porIngrediente';

export default function AdminRecetas() {
  const [platillos, setPlatillos]     = useState<PlatilloConReceta[]>([]);
  const [ingredientes, setIngredientes] = useState<IngredienteBase[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [guardando, setGuardando]     = useState(false);

  const [vista, setVista]     = useState<Vista>('porPlatillo');
  const [busqueda, setBusqueda] = useState('');

  // — Filtros Por Platillo (sólo aplican en esa vista) —
  const [filtroReceta, setFiltroReceta]       = useState<'todos' | 'con' | 'sin'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // — Por Platillo —
  const [agregandoA, setAgregandoA] = useState<string | null>(null); // platilloId
  const [formIngId, setFormIngId]   = useState('');
  const [formCant, setFormCant]     = useState('');
  const [editando, setEditando]     = useState<{ recetaId: string; valor: string } | null>(null);

  // — Por Ingrediente —
  const [ingSelId, setIngSelId]       = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cantComun, setCantComun]     = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [p, i] = await Promise.all([
          listarPlatillosConRecetas(),
          listarIngredientesActivos(),
        ]);
        setPlatillos(p);
        setIngredientes(i);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function recargar() {
    try { setPlatillos(await listarPlatillosConRecetas()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  function cambiarVista(v: Vista) {
    setVista(v);
    setBusqueda('');
    setAgregandoA(null);
    setEditando(null);
    setSeleccionados(new Set());
  }

  // ── Cálculos derivados ───────────────────────────────────────────────────────

  const q = busqueda.toLowerCase();

  // Indicador global — independiente de los filtros activos
  const sinRecetaTotal  = platillos.filter(p => p.recetas.length === 0).length;
  // Categorías dinámicas de todos los platillos (para los chips del filtro)
  const todasCategorias = [...new Set(platillos.map(p => p.platilloCategoria))].sort();

  // Por Platillo: combina búsqueda + filtro de receta + filtro de categoría
  const platFiltrados = platillos
    .filter(p => !q || p.platilloNombre.toLowerCase().includes(q))
    .filter(p => !filtroCategoria || p.platilloCategoria === filtroCategoria)
    .filter(p =>
      filtroReceta === 'con' ? p.recetas.length > 0
      : filtroReceta === 'sin' ? p.recetas.length === 0
      : true
    );
  // Solo las categorías con platillos visibles — así los encabezados vacíos no aparecen
  const categorias = [...new Set(platFiltrados.map(p => p.platilloCategoria))].sort();

  // Por Ingrediente: compute in/out lists when ingredient selected
  const platillosConIng = ingSelId
    ? platillos.filter(p => p.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ingSelId))
    : [];
  const platillosSinIng = ingSelId
    ? platillos.filter(p => !p.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ingSelId))
        .filter(p => !q || p.platilloNombre.toLowerCase().includes(q))
    : [];

  function ingDisponibles(platilloId: string): IngredienteBase[] {
    const p = platillos.find(pl => pl.platilloId === platilloId);
    return ingredientes.filter(
      ing => !p?.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ing.ingredienteId)
    );
  }

  // ── Manejadores ──────────────────────────────────────────────────────────────

  async function handleAgregar(platilloId: string) {
    if (!formIngId) { setError('Selecciona un ingrediente.'); return; }
    const cant = parseFloat(formCant);
    if (isNaN(cant) || cant <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }

    // Verificar duplicado en memoria antes de ir a la DB
    const p = platillos.find(pl => pl.platilloId === platilloId);
    if (p?.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === formIngId)) {
      setError('Este ingrediente ya está en la receta. Usa "Editar" para cambiar la cantidad.');
      return;
    }

    setGuardando(true);
    try {
      await agregarReceta({ platilloId, ingredienteId: formIngId, cantidad: cant });
      setAgregandoA(null);
      setFormIngId('');
      setFormCant('');
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setGuardando(false); }
  }

  async function handleGuardarEdicion() {
    if (!editando) return;
    const cant = parseFloat(editando.valor);
    if (isNaN(cant) || cant <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    setGuardando(true);
    try {
      await actualizarCantidadReceta(editando.recetaId, cant);
      setEditando(null);
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setGuardando(false); }
  }

  async function handleEliminar(recetaId: string) {
    if (!confirm('¿Quitar este ingrediente de la receta?')) return;
    try {
      await eliminarReceta(recetaId);
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  function toggleSeleccionado(platilloId: string) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(platilloId)) next.delete(platilloId); else next.add(platilloId);
      return next;
    });
  }

  async function handleAsignarMasivo() {
    if (!ingSelId) { setError('Selecciona un ingrediente.'); return; }
    if (seleccionados.size === 0) { setError('Selecciona al menos un platillo.'); return; }
    const cant = parseFloat(cantComun);
    if (isNaN(cant) || cant <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    setGuardando(true);
    try {
      await Promise.all(
        [...seleccionados].map(pid =>
          agregarReceta({ platilloId: pid, ingredienteId: ingSelId, cantidad: cant })
        )
      );
      setSeleccionados(new Set());
      setCantComun('');
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setGuardando(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sanpedro-wood font-medium">Cargando recetas…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 bg-[#FAFAF6] min-h-[60vh]">

      {/* Error toast */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-3">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-bold hover:text-red-900 leading-none shrink-0">✕</button>
        </div>
      )}

      {/* Vista selector + buscador */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-sanpedro-gold/30 overflow-hidden bg-white shadow-sm">
          {(['porPlatillo', 'porIngrediente'] as Vista[]).map(v => (
            <button
              key={v}
              onClick={() => cambiarVista(v)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                vista === v
                  ? 'bg-sanpedro-wood text-sanpedro-gold'
                  : 'text-gray-400 hover:text-sanpedro-wood'
              }`}
            >
              {v === 'porPlatillo' ? 'Por Platillo' : 'Por Ingrediente'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={vista === 'porPlatillo' ? 'Buscar platillo…' : 'Buscar platillo…'}
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold bg-white"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400 text-sm">🔍</span>
        </div>
        <p className="text-xs text-gray-400 ml-auto">
          {sinRecetaTotal} platillo(s) sin receta
        </p>
      </div>

      {/* Filtros — sólo visibles en Por Platillo */}
      {vista === 'porPlatillo' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Estado de receta */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(['todos', 'con', 'sin'] as const).map(v => (
              <button
                key={v}
                onClick={() => setFiltroReceta(v)}
                className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                  filtroReceta === v
                    ? 'bg-sanpedro-wood text-sanpedro-gold shadow-sm'
                    : 'text-gray-400 hover:text-sanpedro-wood'
                }`}
              >
                {v === 'todos' ? 'Todos' : v === 'con' ? 'Con receta' : 'Sin receta'}
              </button>
            ))}
          </div>

          {/* Separador */}
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />

          {/* Chips de categoría */}
          <div className="flex flex-wrap items-center gap-1">
            {todasCategorias.map(cat => (
              <button
                key={cat}
                onClick={() => setFiltroCategoria(filtroCategoria === cat ? '' : cat)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  filtroCategoria === cat
                    ? 'bg-sanpedro-gold/20 text-sanpedro-wood border-sanpedro-gold/50'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-sanpedro-gold/40 hover:text-sanpedro-wood'
                }`}
              >
                {cat}
              </button>
            ))}
            {filtroCategoria && (
              <button
                onClick={() => setFiltroCategoria('')}
                className="text-xs text-gray-400 hover:text-sanpedro-wood ml-0.5 transition-colors"
              >
                × limpiar
              </button>
            )}
          </div>

          {/* Conteo de resultados */}
          <span className="text-xs text-gray-400 ml-auto">
            {platFiltrados.length} de {platillos.length} platillo(s)
          </span>
        </div>
      )}

      {/* ══ Vista por Platillo ══ */}
      {vista === 'porPlatillo' && (
        <div className="space-y-6">
          {platFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-gray-400 text-sm">
                {busqueda || filtroReceta !== 'todos' || filtroCategoria
                  ? 'Ningún platillo coincide con los filtros aplicados.'
                  : 'No hay platillos disponibles.'}
              </p>
              {(busqueda || filtroReceta !== 'todos' || filtroCategoria) && (
                <button
                  onClick={() => { setBusqueda(''); setFiltroReceta('todos'); setFiltroCategoria(''); }}
                  className="text-xs text-sanpedro-wood hover:text-sanpedro-dark font-semibold transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : categorias.map(cat => (
            <div key={cat}>
              {/* Cabecera de categoría */}
              <h3 className="text-xs font-bold text-sanpedro-gold uppercase tracking-widest mb-2 pl-1">
                {cat}
              </h3>

              <div className="space-y-2">
                {platFiltrados.filter(p => p.platilloCategoria === cat).map(platillo => {
                  const dispIng = ingDisponibles(platillo.platilloId);
                  const estaAgregando = agregandoA === platillo.platilloId;

                  return (
                    <div key={platillo.platilloId} className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                      {/* Cabecera del platillo */}
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                        <span className="font-semibold text-sanpedro-dark text-sm flex-1">{platillo.platilloNombre}</span>
                        {platillo.recetas.length === 0 && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                            Sin receta
                          </span>
                        )}
                        <span className="text-xs text-gray-400 shrink-0">{platillo.recetas.length} ingrediente(s)</span>
                      </div>

                      {/* Filas de ingredientes */}
                      {platillo.recetas.length > 0 && (
                        <div className="divide-y divide-stone-100">
                          {platillo.recetas.map(r => (
                            <div key={r.recetaId} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-sm text-sanpedro-dark flex-1">
                                {r.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                              </span>

                              {editando?.recetaId === r.recetaId ? (
                                /* Edición en línea */
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={editando.valor}
                                    onChange={e => setEditando({ ...editando, valor: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter')  void handleGuardarEdicion();
                                      if (e.key === 'Escape') setEditando(null);
                                    }}
                                    autoFocus
                                    className="w-20 px-2 py-1 text-sm border border-sanpedro-gold/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-sanpedro-gold text-right"
                                  />
                                  <span className="text-xs text-gray-400">{r.ingredientes?.[0]?.ingredienteUnidad}</span>
                                  <button
                                    onClick={() => void handleGuardarEdicion()}
                                    disabled={guardando}
                                    className="text-green-600 hover:text-green-800 font-bold text-base leading-none disabled:opacity-50"
                                    title="Guardar"
                                  >✓</button>
                                  <button
                                    onClick={() => setEditando(null)}
                                    className="text-gray-400 hover:text-gray-600 font-bold text-base leading-none"
                                    title="Cancelar"
                                  >✕</button>
                                </div>
                              ) : (
                                /* Visualización normal */
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-sm font-semibold text-sanpedro-wood text-right">
                                    {r.recetaCantidad} <span className="font-normal text-gray-400">{r.ingredientes?.[0]?.ingredienteUnidad}</span>
                                  </span>
                                  <button
                                    onClick={() => setEditando({ recetaId: r.recetaId, valor: String(r.recetaCantidad) })}
                                    className="text-xs text-sanpedro-wood hover:text-sanpedro-dark bg-sanpedro-wood-light hover:bg-sanpedro-gold/20 px-2 py-0.5 rounded-lg transition-colors"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => void handleEliminar(r.recetaId)}
                                    className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg transition-colors"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fila para añadir */}
                      <div className="px-4 py-2.5 bg-[#FAFAF6]">
                        {estaAgregando ? (
                          dispIng.length === 0 ? (
                            <div className="flex items-center gap-3">
                              <p className="text-xs text-gray-400 flex-1">Todos los ingredientes ya están en esta receta.</p>
                              <button onClick={() => setAgregandoA(null)} className="text-xs text-gray-400 hover:text-sanpedro-wood">Cerrar</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={formIngId}
                                onChange={e => setFormIngId(e.target.value)}
                                autoFocus
                                className="flex-1 min-w-[150px] px-2 py-1.5 rounded-lg border border-sanpedro-gold/40 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-sanpedro-gold"
                              >
                                <option value="">Ingrediente…</option>
                                {dispIng.map(i => (
                                  <option key={i.ingredienteId} value={i.ingredienteId}>
                                    {i.ingredienteNombre} ({i.ingredienteUnidad})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={formCant}
                                onChange={e => setFormCant(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void handleAgregar(platillo.platilloId); if (e.key === 'Escape') setAgregandoA(null); }}
                                placeholder="Cantidad"
                                className="w-24 px-2 py-1.5 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-1 focus:ring-sanpedro-gold text-right"
                              />
                              <button
                                onClick={() => void handleAgregar(platillo.platilloId)}
                                disabled={guardando}
                                className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => setAgregandoA(null)}
                                className="text-xs text-gray-400 hover:text-sanpedro-wood px-2 py-1.5 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          )
                        ) : (
                          <button
                            onClick={() => { setAgregandoA(platillo.platilloId); setFormIngId(''); setFormCant(''); setEditando(null); }}
                            className="text-xs text-sanpedro-wood hover:text-sanpedro-dark font-semibold transition-colors"
                          >
                            + Añadir ingrediente
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ Vista por Ingrediente ══ */}
      {vista === 'porIngrediente' && (
        <div className="space-y-5">
          {/* Selector de ingrediente */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
            <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
              Ingrediente
            </label>
            <select
              value={ingSelId}
              onChange={e => { setIngSelId(e.target.value); setSeleccionados(new Set()); setCantComun(''); setBusqueda(''); }}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
            >
              <option value="">Seleccionar ingrediente…</option>
              {ingredientes.map(i => (
                <option key={i.ingredienteId} value={i.ingredienteId}>
                  {i.ingredienteNombre} ({i.ingredienteUnidad})
                </option>
              ))}
            </select>
          </div>

          {ingSelId && (
            <>
              {/* Platillos que ya usan este ingrediente */}
              <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <h3 className="text-xs font-bold text-sanpedro-wood uppercase tracking-widest">
                    Platillos que usan este ingrediente ({platillosConIng.length})
                  </h3>
                </div>
                {platillosConIng.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Ninguno todavía.</p>
                ) : (
                  <div className="divide-y divide-sanpedro-gold/10">
                    {platillosConIng.map(p => {
                      const r = p.recetas.find(rx => rx.ingredientes?.[0]?.ingredienteId === ingSelId);
                      return (
                        <div key={p.platilloId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-sm text-sanpedro-dark flex-1">{p.platilloNombre}</span>
                          <span className="text-xs text-gray-400">{p.platilloCategoria}</span>
                          <span className="text-sm font-semibold text-sanpedro-wood">
                            {r?.recetaCantidad} <span className="font-normal text-gray-400">{r?.ingredientes?.[0]?.ingredienteUnidad}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Asignación masiva */}
              {platillosSinIng.length > 0 || busqueda ? (
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
                    <h3 className="text-xs font-bold text-sanpedro-wood uppercase tracking-widest flex-1">
                      Asignar a más platillos
                    </h3>
                    {seleccionados.size > 0 && (
                      <button
                        onClick={() => setSeleccionados(new Set())}
                        className="text-xs text-gray-400 hover:text-sanpedro-wood"
                      >
                        Deseleccionar todo
                      </button>
                    )}
                  </div>

                  {/* Buscador dentro del listado */}
                  <div className="px-4 pt-3">
                    <div className="relative max-w-xs">
                      <input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar platillo…"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-1 focus:ring-sanpedro-gold"
                      />
                      <span className="absolute left-2.5 top-2 text-gray-400 text-sm">🔍</span>
                    </div>
                  </div>

                  {/* Lista de checkboxes */}
                  <div className="max-h-72 overflow-y-auto p-3 space-y-0.5 mt-2">
                    {platillosSinIng.length === 0 ? (
                      <p className="text-sm text-gray-400 px-1 py-2">Sin resultados.</p>
                    ) : platillosSinIng.map(p => (
                      <label
                        key={p.platilloId}
                        className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-sanpedro-gold/8 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.has(p.platilloId)}
                          onChange={() => toggleSeleccionado(p.platilloId)}
                          className="accent-sanpedro-gold w-4 h-4"
                        />
                        <span className="text-sm text-sanpedro-dark flex-1">{p.platilloNombre}</span>
                        <span className="text-xs text-gray-400">{p.platilloCategoria}</span>
                      </label>
                    ))}
                  </div>

                  {/* Pie: cantidad + botón asignar */}
                  <div className="px-4 py-3 border-t border-sanpedro-gold/10 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-sanpedro-wood whitespace-nowrap">
                        Cantidad por platillo
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={cantComun}
                        onChange={e => setCantComun(e.target.value)}
                        placeholder="0.00"
                        className="w-24 px-2 py-1.5 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-1 focus:ring-sanpedro-gold text-right"
                      />
                      <span className="text-xs text-gray-400">
                        {ingredientes.find(i => i.ingredienteId === ingSelId)?.ingredienteUnidad}
                      </span>
                    </div>
                    <button
                      onClick={() => void handleAsignarMasivo()}
                      disabled={guardando || seleccionados.size === 0 || !cantComun}
                      className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-bold text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {guardando ? 'Asignando…' : `Asignar${seleccionados.size > 0 ? ` (${seleccionados.size})` : ''}`}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Todos los platillos activos ya tienen este ingrediente en su receta.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
