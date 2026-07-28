import { useEffect, useState } from 'react';
import {
  listarPlatillosConRecetas, listarIngredientesActivos,
  agregarReceta, actualizarCantidadReceta, eliminarReceta,
  type PlatilloConReceta, type IngredienteBase,
} from '../lib/inventario';
import Boton    from './ui/Boton';
import Insignia from './ui/Insignia';
import Tarjeta  from './ui/Tarjeta';
import EstadoVacio from './ui/EstadoVacio';

type Vista = 'porPlatillo' | 'porIngrediente';

export default function AdminRecetas() {
  const [platillos, setPlatillos]     = useState<PlatilloConReceta[]>([]);
  const [ingredientes, setIngredientes] = useState<IngredienteBase[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [guardando, setGuardando]     = useState(false);

  const [vista, setVista]       = useState<Vista>('porPlatillo');
  const [busqueda, setBusqueda] = useState('');

  const [filtroReceta, setFiltroReceta]       = useState<'todos' | 'con' | 'sin'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const [agregandoA, setAgregandoA] = useState<string | null>(null);
  const [formIngId, setFormIngId]   = useState('');
  const [formCant, setFormCant]     = useState('');
  const [editando, setEditando]     = useState<{ recetaId: string; valor: string } | null>(null);

  const [ingSelId, setIngSelId]         = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cantComun, setCantComun]       = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [p, i] = await Promise.all([listarPlatillosConRecetas(), listarIngredientesActivos()]);
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
    setVista(v); setBusqueda(''); setAgregandoA(null); setEditando(null); setSeleccionados(new Set());
  }

  // ── Derivados ────────────────────────────────────────────────────────────────
  const q = busqueda.toLowerCase();
  const sinRecetaTotal  = platillos.filter(p => p.recetas.length === 0).length;
  const todasCategorias = [...new Set(platillos.map(p => p.platilloCategoria))].sort();

  const platFiltrados = platillos
    .filter(p => !q || p.platilloNombre.toLowerCase().includes(q))
    .filter(p => !filtroCategoria || p.platilloCategoria === filtroCategoria)
    .filter(p =>
      filtroReceta === 'con' ? p.recetas.length > 0 :
      filtroReceta === 'sin' ? p.recetas.length === 0 : true
    );
  const categorias = [...new Set(platFiltrados.map(p => p.platilloCategoria))].sort();

  const platillosConIng = ingSelId
    ? platillos.filter(p => p.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ingSelId))
    : [];
  const platillosSinIng = ingSelId
    ? platillos
        .filter(p => !p.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ingSelId))
        .filter(p => !q || p.platilloNombre.toLowerCase().includes(q))
    : [];

  function ingDisponibles(platilloId: string): IngredienteBase[] {
    const p = platillos.find(pl => pl.platilloId === platilloId);
    return ingredientes.filter(ing => !p?.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === ing.ingredienteId));
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleAgregar(platilloId: string) {
    if (!formIngId) { setError('Selecciona un ingrediente.'); return; }
    const cant = parseFloat(formCant);
    if (isNaN(cant) || cant <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    const p = platillos.find(pl => pl.platilloId === platilloId);
    if (p?.recetas.some(r => r.ingredientes?.[0]?.ingredienteId === formIngId)) {
      setError('Este ingrediente ya está en la receta. Usa "Editar" para cambiar la cantidad.');
      return;
    }
    setGuardando(true);
    try {
      await agregarReceta({ platilloId, ingredienteId: formIngId, cantidad: cant });
      setAgregandoA(null); setFormIngId(''); setFormCant('');
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
    try { await eliminarReceta(recetaId); await recargar(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
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
      await Promise.all([...seleccionados].map(pid =>
        agregarReceta({ platilloId: pid, ingredienteId: ingSelId, cantidad: cant })
      ));
      setSeleccionados(new Set()); setCantComun('');
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally   { setGuardando(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-tinta-media text-sm">Cargando recetas…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {error && (
        <Tarjeta className="flex items-start gap-3">
          <span className="flex-1 text-sm text-peligro">{error}</span>
          <button onClick={() => setError(null)} className="font-bold text-peligro hover:opacity-70 leading-none shrink-0">✕</button>
        </Tarjeta>
      )}

      {/* Selector de vista + buscador */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-linea overflow-hidden bg-tarjeta">
          {(['porPlatillo', 'porIngrediente'] as Vista[]).map(v => (
            <button
              key={v}
              onClick={() => cambiarVista(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                vista === v ? 'bg-oro text-carbon' : 'text-tinta-suave hover:text-tinta-media'
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
            placeholder="Buscar platillo…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
          />
          <span className="absolute left-2.5 top-2.5 text-tinta-suave text-sm">🔍</span>
        </div>

        <p className="text-xs text-tinta-suave ml-auto">
          {sinRecetaTotal} platillo(s) sin receta
        </p>
      </div>

      {/* Filtros — solo Por Platillo */}
      {vista === 'porPlatillo' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Chips estado receta */}
          <div className="flex rounded-lg border border-linea overflow-hidden bg-tarjeta">
            {(['todos', 'con', 'sin'] as const).map(v => (
              <button
                key={v}
                onClick={() => setFiltroReceta(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtroReceta === v ? 'bg-oro text-carbon' : 'text-tinta-suave hover:text-tinta-media'
                }`}
              >
                {v === 'todos' ? 'Todos' : v === 'con' ? 'Con receta' : 'Sin receta'}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-linea hidden sm:block" />

          {/* Chips de categoría */}
          <div className="flex flex-wrap items-center gap-1">
            {todasCategorias.map(cat => (
              <button
                key={cat}
                onClick={() => setFiltroCategoria(filtroCategoria === cat ? '' : cat)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors min-h-[28px] ${
                  filtroCategoria === cat
                    ? 'bg-oro text-carbon border-oro'
                    : 'bg-tarjeta text-tinta border-linea hover:bg-linea-suave'
                }`}
              >
                {cat}
              </button>
            ))}
            {filtroCategoria && (
              <button
                onClick={() => setFiltroCategoria('')}
                className="text-xs text-tinta-suave hover:text-tinta-media ml-0.5 transition-colors"
              >
                × limpiar
              </button>
            )}
          </div>

          <span className="text-xs text-tinta-suave ml-auto">
            {platFiltrados.length} de {platillos.length}
          </span>
        </div>
      )}

      {/* ══ Por Platillo ══ */}
      {vista === 'porPlatillo' && (
        <div className="space-y-6">
          {platFiltrados.length === 0 ? (
            <EstadoVacio
              icono="🍽"
              titulo="Ningún platillo coincide con los filtros"
              accion={
                (busqueda || filtroReceta !== 'todos' || filtroCategoria)
                  ? <Boton variante="texto" tamanio="sm" onClick={() => { setBusqueda(''); setFiltroReceta('todos'); setFiltroCategoria(''); }}>
                      Limpiar filtros
                    </Boton>
                  : undefined
              }
            />
          ) : categorias.map(cat => (
            <div key={cat}>
              <h3 className="text-[11px] uppercase tracking-[0.12em] text-tinta-suave font-medium mb-2 pl-1">{cat}</h3>

              <Tarjeta sinPadding className="overflow-hidden divide-y divide-linea-suave">
                {platFiltrados.filter(p => p.platilloCategoria === cat).map(platillo => {
                  const dispIng      = ingDisponibles(platillo.platilloId);
                  const estaAgregando = agregandoA === platillo.platilloId;
                  const tieneReceta  = platillo.recetas.length > 0;

                  return (
                    <div key={platillo.platilloId}>
                      {/* Cabecera del platillo */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="font-medium text-tinta text-sm flex-1">{platillo.platilloNombre}</span>
                        <Insignia tono={tieneReceta ? 'exito' : 'neutro'}>
                          {tieneReceta ? 'Con receta' : 'Sin receta'}
                        </Insignia>
                        {tieneReceta && (
                          <span className="text-xs text-tinta-suave shrink-0">{platillo.recetas.length} ing.</span>
                        )}
                      </div>

                      {/* Ingredientes de la receta */}
                      {platillo.recetas.length > 0 && (
                        <div className="divide-y divide-linea-suave bg-linea-suave/30">
                          {platillo.recetas.map(r => (
                            <div key={r.recetaId} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-sm text-tinta flex-1">
                                {r.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                              </span>

                              {editando?.recetaId === r.recetaId ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number" step="0.01" min="0.01"
                                    value={editando.valor}
                                    onChange={e => setEditando({ ...editando, valor: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter')  void handleGuardarEdicion();
                                      if (e.key === 'Escape') setEditando(null);
                                    }}
                                    autoFocus
                                    className="w-20 px-2 py-1 text-sm border border-linea rounded-lg focus:outline-none focus:ring-1 focus:ring-oro text-right"
                                  />
                                  <span className="text-xs text-tinta-suave">{r.ingredientes?.[0]?.ingredienteUnidad}</span>
                                  <button onClick={() => void handleGuardarEdicion()} disabled={guardando}
                                    className="text-exito hover:opacity-70 font-bold text-base leading-none disabled:opacity-40" title="Guardar">✓</button>
                                  <button onClick={() => setEditando(null)}
                                    className="text-tinta-suave hover:text-tinta font-bold text-base leading-none" title="Cancelar">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-sm font-medium text-oro-tinta">
                                    {r.recetaCantidad}
                                    <span className="font-normal text-tinta-suave ml-1">{r.ingredientes?.[0]?.ingredienteUnidad}</span>
                                  </span>
                                  <Boton variante="secundario" tamanio="sm"
                                    onClick={() => setEditando({ recetaId: r.recetaId, valor: String(r.recetaCantidad) })}>
                                    Editar
                                  </Boton>
                                  <Boton variante="peligro" tamanio="sm" onClick={() => void handleEliminar(r.recetaId)}>
                                    Quitar
                                  </Boton>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Añadir ingrediente */}
                      <div className="px-4 py-2.5 bg-linea-suave/20">
                        {estaAgregando ? (
                          dispIng.length === 0 ? (
                            <div className="flex items-center gap-3">
                              <p className="text-xs text-tinta-suave flex-1">Todos los ingredientes ya están en esta receta.</p>
                              <button onClick={() => setAgregandoA(null)} className="text-xs text-tinta-suave hover:text-tinta-media">Cerrar</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={formIngId}
                                onChange={e => setFormIngId(e.target.value)}
                                autoFocus
                                className="flex-1 min-w-[150px] px-2 py-1.5 rounded-lg border border-linea text-sm bg-white focus:outline-none focus:ring-1 focus:ring-oro"
                              >
                                <option value="">Ingrediente…</option>
                                {dispIng.map(i => (
                                  <option key={i.ingredienteId} value={i.ingredienteId}>
                                    {i.ingredienteNombre} ({i.ingredienteUnidad})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number" step="0.01" min="0.01"
                                value={formCant}
                                onChange={e => setFormCant(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void handleAgregar(platillo.platilloId); if (e.key === 'Escape') setAgregandoA(null); }}
                                placeholder="Cantidad"
                                className="w-24 px-2 py-1.5 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro text-right"
                              />
                              <Boton variante="primario" tamanio="sm" onClick={() => void handleAgregar(platillo.platilloId)} disabled={guardando}>
                                OK
                              </Boton>
                              <Boton variante="texto" tamanio="sm" onClick={() => setAgregandoA(null)}>Cancelar</Boton>
                            </div>
                          )
                        ) : (
                          <button
                            onClick={() => { setAgregandoA(platillo.platilloId); setFormIngId(''); setFormCant(''); setEditando(null); }}
                            className="text-xs text-tinta-media hover:text-tinta font-medium transition-colors"
                          >
                            + Añadir ingrediente
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Tarjeta>
            </div>
          ))}
        </div>
      )}

      {/* ══ Por Ingrediente ══ */}
      {vista === 'porIngrediente' && (
        <div className="space-y-5">
          <Tarjeta>
            <label className="block text-[12px] font-medium text-tinta-media mb-1">Ingrediente</label>
            <select
              value={ingSelId}
              onChange={e => { setIngSelId(e.target.value); setSeleccionados(new Set()); setCantComun(''); setBusqueda(''); }}
              className="w-full max-w-xs h-[44px] px-3 rounded-lg border border-linea text-sm bg-white focus:outline-none focus:ring-1 focus:ring-oro"
            >
              <option value="">Seleccionar ingrediente…</option>
              {ingredientes.map(i => (
                <option key={i.ingredienteId} value={i.ingredienteId}>
                  {i.ingredienteNombre} ({i.ingredienteUnidad})
                </option>
              ))}
            </select>
          </Tarjeta>

          {ingSelId && (
            <>
              {/* Platillos que ya usan este ingrediente */}
              <Tarjeta sinPadding className="overflow-hidden">
                <div className="px-4 py-3 border-b border-linea">
                  <h3 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest">
                    Platillos que usan este ingrediente ({platillosConIng.length})
                  </h3>
                </div>
                {platillosConIng.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-tinta-suave">Ninguno todavía.</p>
                ) : (
                  <div className="divide-y divide-linea-suave">
                    {platillosConIng.map(p => {
                      const r = p.recetas.find(rx => rx.ingredientes?.[0]?.ingredienteId === ingSelId);
                      return (
                        <div key={p.platilloId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-sm text-tinta flex-1">{p.platilloNombre}</span>
                          <span className="text-xs text-tinta-suave">{p.platilloCategoria}</span>
                          <span className="text-sm font-medium text-oro-tinta">
                            {r?.recetaCantidad} <span className="font-normal text-tinta-suave">{r?.ingredientes?.[0]?.ingredienteUnidad}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Tarjeta>

              {/* Asignación masiva */}
              {(platillosSinIng.length > 0 || busqueda) ? (
                <Tarjeta sinPadding className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-linea flex items-center gap-3">
                    <h3 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest flex-1">
                      Asignar a más platillos
                    </h3>
                    {seleccionados.size > 0 && (
                      <button onClick={() => setSeleccionados(new Set())} className="text-xs text-tinta-suave hover:text-tinta-media">
                        Deseleccionar todo
                      </button>
                    )}
                  </div>

                  <div className="px-4 pt-3">
                    <div className="relative max-w-xs">
                      <input
                        type="text" value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar platillo…"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
                      />
                      <span className="absolute left-2.5 top-2 text-tinta-suave text-sm">🔍</span>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-3 space-y-0.5 mt-2">
                    {platillosSinIng.length === 0 ? (
                      <p className="text-sm text-tinta-suave px-1 py-2">Sin resultados.</p>
                    ) : platillosSinIng.map(p => (
                      <label key={p.platilloId} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-linea-suave cursor-pointer">
                        <input type="checkbox" checked={seleccionados.has(p.platilloId)}
                          onChange={() => toggleSeleccionado(p.platilloId)} className="accent-oro w-4 h-4" />
                        <span className="text-sm text-tinta flex-1">{p.platilloNombre}</span>
                        <span className="text-xs text-tinta-suave">{p.platilloCategoria}</span>
                      </label>
                    ))}
                  </div>

                  <div className="px-4 py-3 border-t border-linea flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-tinta-media whitespace-nowrap">Cantidad por platillo</label>
                      <input
                        type="number" step="0.01" min="0.01"
                        value={cantComun}
                        onChange={e => setCantComun(e.target.value)}
                        placeholder="0.00"
                        className="w-24 px-2 py-1.5 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro text-right"
                      />
                      <span className="text-xs text-tinta-suave">
                        {ingredientes.find(i => i.ingredienteId === ingSelId)?.ingredienteUnidad}
                      </span>
                    </div>
                    <Boton
                      variante="primario"
                      tamanio="sm"
                      onClick={() => void handleAsignarMasivo()}
                      disabled={guardando || seleccionados.size === 0 || !cantComun}
                    >
                      {guardando ? 'Asignando…' : `Asignar${seleccionados.size > 0 ? ` (${seleccionados.size})` : ''}`}
                    </Boton>
                  </div>
                </Tarjeta>
              ) : (
                <p className="text-sm text-tinta-suave">Todos los platillos activos ya tienen este ingrediente en su receta.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
