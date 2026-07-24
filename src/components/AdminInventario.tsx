import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContext';
import { fmtFecha, fechaHoy, rangoUTC } from '../lib/exportar';
import {
  listarStock, listarIngredientesActivos, crearIngrediente, actualizarIngrediente,
  toggleActivoIngrediente, registrarMovimiento, listarMovimientos,
  type StockItem, type IngredienteBase, type MovimientoConDetalle,
} from '../lib/inventario';
import AdminRecetas from './AdminRecetas';

type SubTab = 'stock' | 'entrada' | 'movimientos' | 'recetas';

type FormIngrediente = {
  ingredienteNombre: string;
  ingredienteUnidad: string;
  ingredienteStock: string;
  ingredienteStockMin: string;
};

const FORM_VACIO: FormIngrediente = {
  ingredienteNombre: '', ingredienteUnidad: '', ingredienteStock: '0', ingredienteStockMin: '0',
};

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', devolucion: 'Devolución',
};
const TIPO_CLASE: Record<string, string> = {
  entrada:    'bg-green-100 text-green-700',
  salida:     'bg-red-100   text-red-600',
  ajuste:     'bg-amber-100 text-amber-700',
  devolucion: 'bg-blue-100  text-blue-700',
};

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'stock',       label: 'Stock' },
  { id: 'entrada',     label: 'Entrada de Mercadería' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'recetas',     label: 'Recetas' },
];

export default function AdminInventario() {
  const { perfil } = useSesion();
  const [subTab, setSubTab] = useState<SubTab>('stock');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Datos compartidos ──
  const [ingredientes, setIngredientes] = useState<IngredienteBase[]>([]);

  // ── Stock ──
  const [stock, setStock]               = useState<StockItem[]>([]);
  const [cargandoStock, setCargandoStock] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando]         = useState<StockItem | null>(null);
  const [form, setForm]                 = useState<FormIngrediente>(FORM_VACIO);
  const [guardandoForm, setGuardandoForm] = useState(false);

  // ── Entrada ──
  const [ingId, setIngId]         = useState('');
  const [cantidad, setCantidad]   = useState('');
  const [tipoMov, setTipoMov]     = useState<'entrada' | 'ajuste'>('entrada');
  const [nota, setNota]           = useState('');
  const [guardandoEntrada, setGuardandoEntrada] = useState(false);

  // ── Movimientos ──
  const [movimientos, setMovimientos]     = useState<MovimientoConDetalle[]>([]);
  const [filtroIng, setFiltroIng]         = useState('');
  const [filtroTipo, setFiltroTipo]       = useState('');
  const [filtroDesde, setFiltroDesde]     = useState(() => fechaHoy());
  const [filtroHasta, setFiltroHasta]     = useState(() => fechaHoy());
  const [cargandoMov, setCargandoMov]     = useState(false);

  async function recargarStock() {
    setCargandoStock(true);
    try { setStock(await listarStock()); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : String(e)); }
    finally   { setCargandoStock(false); }
  }

  async function cargarIngredientes() {
    try { setIngredientes(await listarIngredientesActivos()); }
    catch { /* no bloquea la UI */ }
  }

  async function cargarMovimientos() {
    setCargandoMov(true);
    try {
      const { gte, lte } = rangoUTC(filtroDesde, filtroHasta);
      setMovimientos(await listarMovimientos({
        ingredienteId: filtroIng  || undefined,
        tipo:          filtroTipo || undefined,
        gte,
        lte,
      }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCargandoMov(false);
    }
  }

  useEffect(() => {
    void recargarStock();
    void cargarIngredientes();
  }, []);

  useEffect(() => {
    if (subTab === 'movimientos') void cargarMovimientos();
  }, [subTab, filtroIng, filtroTipo, filtroDesde, filtroHasta]);

  const alertaCount = stock.filter(s => s.stockDisponible <= s.ingredienteStockMin).length;

  // ── CRUD ingrediente ──
  function abrirNuevo() {
    setForm(FORM_VACIO);
    setEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(item: StockItem) {
    setForm({
      ingredienteNombre:   item.ingredienteNombre,
      ingredienteUnidad:   item.ingredienteUnidad,
      ingredienteStock:    String(item.stockReal),
      ingredienteStockMin: String(item.ingredienteStockMin),
    });
    setEditando(item);
    setModalAbierto(true);
  }

  async function guardarForm() {
    if (!form.ingredienteNombre.trim() || !form.ingredienteUnidad.trim()) {
      setErrorMsg('Nombre y unidad son obligatorios.');
      return;
    }
    setGuardandoForm(true);
    const datos = {
      ingredienteNombre:   form.ingredienteNombre.trim(),
      ingredienteUnidad:   form.ingredienteUnidad.trim(),
      ingredienteStock:    parseFloat(form.ingredienteStock)    || 0,
      ingredienteStockMin: parseFloat(form.ingredienteStockMin) || 0,
    };
    try {
      if (editando) await actualizarIngrediente(editando.ingredienteId, datos);
      else          await crearIngrediente(datos);
      setModalAbierto(false);
      await recargarStock();
      await cargarIngredientes();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoForm(false);
    }
  }

  async function handleToggleActivo(item: StockItem) {
    try {
      await toggleActivoIngrediente(item.ingredienteId, !item.ingredienteActivo);
      await recargarStock();
      await cargarIngredientes();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Entrada / Ajuste ──
  async function handleRegistrar() {
    if (!ingId) { setErrorMsg('Selecciona un ingrediente.'); return; }
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant === 0) { setErrorMsg('Ingresa una cantidad válida (distinta de cero).'); return; }
    if (tipoMov === 'entrada' && cant <= 0) { setErrorMsg('La cantidad de entrada debe ser positiva.'); return; }

    setGuardandoEntrada(true);
    setErrorMsg(null);
    try {
      await registrarMovimiento({
        ingredienteId: ingId,
        cantidad:      cant,
        tipo:          tipoMov,
        nota:          nota.trim() || undefined,
        usuarioId:     perfil!.perfilId,
      });
      setIngId('');
      setCantidad('');
      setNota('');
      await recargarStock();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoEntrada(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh] bg-[#FAFAF6]">

      {/* Toast de error */}
      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 bg-red-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold hover:text-red-300 text-lg leading-none">✕</button>
        </div>
      )}

      {/* Sub-navegación */}
      <div className="flex overflow-x-auto border-b border-sanpedro-gold/20 bg-white px-2 sm:px-4">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`relative px-3 sm:px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              subTab === t.id
                ? 'border-sanpedro-gold text-sanpedro-wood'
                : 'border-transparent text-gray-400 hover:text-sanpedro-wood'
            }`}
          >
            {t.label}
            {t.id === 'stock' && alertaCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold">
                {alertaCount > 9 ? '9+' : alertaCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Stock ══ */}
      {subTab === 'stock' && (
        <div className="p-4 md:p-6 space-y-4">
          {alertaCount > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
              {alertaCount} ingrediente(s) con stock disponible en o por debajo del mínimo.
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">{stock.length} ingredientes</p>
            <button
              onClick={abrirNuevo}
              className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-bold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + Nuevo Ingrediente
            </button>
          </div>

          {cargandoStock ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sanpedro-wood font-medium">Cargando stock…</p>
            </div>
          ) : stock.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-gray-400 text-sm">No hay ingredientes registrados.</p>
            </div>
          ) : (
            <>
              {/* Desktop: tabla */}
              <div className="hidden md:block bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sanpedro-wood text-white text-xs uppercase tracking-wide">
                        {['Ingrediente', 'Unidad', 'Stock Real', 'Comprometido', 'Disponible', 'Mínimo', 'Acciones'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white">
                      {stock.map(s => {
                        const enAlerta = s.stockDisponible <= s.ingredienteStockMin;
                        return (
                          <tr key={s.ingredienteId} className={`transition-colors ${enAlerta ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-stone-50'}`}>
                            <td className="px-4 py-3 font-semibold text-sanpedro-dark">{s.ingredienteNombre}</td>
                            <td className="px-4 py-3 text-gray-500">{s.ingredienteUnidad}</td>
                            <td className="px-4 py-3 text-right font-bold text-sanpedro-dark">{s.stockReal}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{s.comprometido}</td>
                            <td className={`px-4 py-3 text-right font-bold ${enAlerta ? 'text-red-600' : 'text-sanpedro-wood'}`}>
                              {s.stockDisponible}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400">{s.ingredienteStockMin}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => abrirEditar(s)} className="text-xs font-semibold text-sanpedro-wood hover:text-sanpedro-dark bg-sanpedro-wood-light hover:bg-sanpedro-gold/20 px-3 py-1 rounded-lg transition-colors">Editar</button>
                                <button onClick={() => handleToggleActivo(s)} className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-colors ${s.ingredienteActivo ? 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200' : 'text-green-700 bg-green-50 hover:bg-green-100 border-green-200'}`}>
                                  {s.ingredienteActivo ? 'Desactivar' : 'Activar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Móvil: tarjetas */}
              <div className="md:hidden space-y-3">
                {stock.map(s => {
                  const enAlerta = s.stockDisponible <= s.ingredienteStockMin;
                  return (
                    <div key={s.ingredienteId} className={`bg-white rounded-xl border border-stone-200 p-4 shadow-sm ${enAlerta ? 'border-l-4 border-l-red-500' : 'border-t-[3px] border-t-sanpedro-gold'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-sanpedro-dark">{s.ingredienteNombre}</p>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-0.5">{s.ingredienteUnidad}</p>
                        </div>
                        {enAlerta && <span className="shrink-0 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Stock bajo</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                        <div><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Stock Real</p><p className="font-bold text-sanpedro-dark">{s.stockReal}</p></div>
                        <div><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Comprometido</p><p className="text-stone-500">{s.comprometido}</p></div>
                        <div><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Disponible</p><p className={`font-bold ${enAlerta ? 'text-red-600' : 'text-sanpedro-wood'}`}>{s.stockDisponible}</p></div>
                        <div><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Mínimo</p><p className="text-stone-400">{s.ingredienteStockMin}</p></div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-stone-100">
                        <button onClick={() => abrirEditar(s)} className="flex-1 text-xs font-semibold text-sanpedro-wood bg-sanpedro-wood-light hover:bg-sanpedro-gold/20 px-3 py-2.5 rounded-lg min-h-[44px] transition-colors">Editar</button>
                        <button onClick={() => handleToggleActivo(s)} className={`flex-1 text-xs font-semibold px-3 py-2.5 rounded-lg border min-h-[44px] transition-colors ${s.ingredienteActivo ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'}`}>
                          {s.ingredienteActivo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ Entrada de Mercadería ══ */}
      {subTab === 'entrada' && (
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 max-w-lg space-y-5">
            <h2 className="text-sm font-bold text-sanpedro-dark">Registrar movimiento de stock</h2>

            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Ingrediente *</label>
              <select
                value={ingId}
                onChange={e => setIngId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              >
                <option value="">Seleccionar…</option>
                {ingredientes.map(i => (
                  <option key={i.ingredienteId} value={i.ingredienteId}>
                    {i.ingredienteNombre} ({i.ingredienteUnidad})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-2">Tipo *</label>
              <div className="flex gap-6">
                {(['entrada', 'ajuste'] as const).map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="tipoMov"
                      value={t}
                      checked={tipoMov === t}
                      onChange={() => { setTipoMov(t); setCantidad(''); }}
                      className="accent-sanpedro-gold"
                    />
                    <span className="text-sm font-medium text-sanpedro-dark">
                      {t === 'entrada' ? 'Compra / Entrada' : 'Ajuste de conteo'}
                    </span>
                  </label>
                ))}
              </div>
              {tipoMov === 'ajuste' && (
                <p className="text-xs text-gray-400 mt-1.5">La cantidad puede ser negativa para corregir un sobrante.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">
                Cantidad * {tipoMov === 'entrada' ? '(positiva)' : '(+ o −)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder={tipoMov === 'entrada' ? '10' : '−3.5'}
                className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Nota (opcional)</label>
              <input
                type="text"
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Ej. Factura #1234, proveedor XYZ"
                className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              />
            </div>

            <button
              onClick={handleRegistrar}
              disabled={guardandoEntrada}
              className="w-full bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {guardandoEntrada ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Movimientos ══ */}
      {subTab === 'movimientos' && (
        <div className="p-4 md:p-6 space-y-4">
          {/* Filtros */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 sm:gap-4 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Ingrediente</label>
              <select
                value={filtroIng}
                onChange={e => setFiltroIng(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              >
                <option value="">Todos</option>
                {ingredientes.map(i => (
                  <option key={i.ingredienteId} value={i.ingredienteId}>{i.ingredienteNombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Tipo</label>
              <select
                value={filtroTipo}
                onChange={e => setFiltroTipo(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              >
                <option value="">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="ajuste">Ajuste</option>
                <option value="devolucion">Devolución</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Desde</label>
              <input
                type="date"
                value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Hasta</label>
              <input
                type="date"
                value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
              />
            </div>
          </div>

          {cargandoMov ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sanpedro-wood font-medium">Cargando movimientos…</p>
            </div>
          ) : movimientos.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-gray-400 text-sm">Sin movimientos para los filtros seleccionados.</p>
            </div>
          ) : (
            <>
              {/* Desktop: tabla */}
              <div className="hidden md:block bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sanpedro-wood text-white text-xs uppercase tracking-wide">
                        {['Fecha/Hora', 'Ingrediente', 'Tipo', 'Cantidad', 'Usuario', 'Nota'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white">
                      {movimientos.map(m => (
                        <tr key={m.movimientoId} className="hover:bg-stone-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtFecha(m.movimientoCreadoEn)}</td>
                          <td className="px-4 py-3 font-semibold text-sanpedro-dark">
                            {m.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                            {m.ingredientes?.[0]?.ingredienteUnidad && (
                              <span className="ml-1 text-xs text-gray-400 font-normal">({m.ingredientes[0].ingredienteUnidad})</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${TIPO_CLASE[m.movimientoTipo] ?? 'bg-gray-100 text-gray-600'}`}>
                              {TIPO_LABEL[m.movimientoTipo] ?? m.movimientoTipo}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${m.movimientoCantidad < 0 ? 'text-red-600' : 'text-sanpedro-wood'}`}>
                            {m.movimientoCantidad > 0 ? '+' : ''}{m.movimientoCantidad}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.perfiles?.[0]?.perfilNombre ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate" title={m.movimientoNota ?? ''}>{m.movimientoNota ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Móvil: tarjetas */}
              <div className="md:hidden space-y-3">
                {movimientos.map(m => (
                  <div key={m.movimientoId} className="bg-white rounded-xl border border-stone-200 border-t-[3px] border-t-sanpedro-gold p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-sanpedro-dark">
                          {m.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                          {m.ingredientes?.[0]?.ingredienteUnidad && (
                            <span className="ml-1 text-xs text-gray-400 font-normal">({m.ingredientes[0].ingredienteUnidad})</span>
                          )}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 text-xs font-bold rounded-full ${TIPO_CLASE[m.movimientoTipo] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TIPO_LABEL[m.movimientoTipo] ?? m.movimientoTipo}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-stone-100 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Fecha</p>
                        <p className="text-xs text-gray-500">{fmtFecha(m.movimientoCreadoEn)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Cantidad</p>
                        <p className={`font-bold ${m.movimientoCantidad < 0 ? 'text-red-600' : 'text-sanpedro-wood'}`}>
                          {m.movimientoCantidad > 0 ? '+' : ''}{m.movimientoCantidad}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Usuario</p>
                        <p className="text-xs text-gray-600">{m.perfiles?.[0]?.perfilNombre ?? '—'}</p>
                      </div>
                      {m.movimientoNota && (
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Nota</p>
                          <p className="text-xs text-gray-400 truncate">{m.movimientoNota}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ Recetas ══ */}
      {subTab === 'recetas' && <AdminRecetas />}

      {/* ══ Modal CRUD Ingrediente ══ */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-sanpedro-dark/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setModalAbierto(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden max-h-[95svh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-sanpedro-wood px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-white">
                {editando ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}
              </h3>
            </div>
            <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60 shrink-0" />

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.ingredienteNombre}
                  onChange={e => setForm(f => ({ ...f, ingredienteNombre: e.target.value }))}
                  placeholder="Ej. Tomate"
                  className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Unidad *</label>
                <input
                  type="text"
                  value={form.ingredienteUnidad}
                  onChange={e => setForm(f => ({ ...f, ingredienteUnidad: e.target.value }))}
                  placeholder="Ej. kg, L, unidad, porción"
                  className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Stock actual</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.ingredienteStock}
                    onChange={e => setForm(f => ({ ...f, ingredienteStock: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-widest mb-1">Stock mínimo</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.ingredienteStockMin}
                    onChange={e => setForm(f => ({ ...f, ingredienteStockMin: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-sanpedro-gold/40 text-sm focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-sanpedro-gold/10 flex justify-end gap-3 shrink-0">
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
