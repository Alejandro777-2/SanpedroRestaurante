import { useEffect, useState } from 'react';
import { useSesion } from '../context/SesionContext';
import { rangoUTC, fechaHoy } from '../lib/exportar';
import {
  listarStock, listarIngredientesActivos, crearIngrediente, actualizarIngrediente,
  toggleActivoIngrediente, registrarMovimiento, listarMovimientos,
  type StockItem, type IngredienteBase, type MovimientoConDetalle,
} from '../lib/inventario';
import AdminRecetas     from './AdminRecetas';
import Boton            from './ui/Boton';
import Insignia         from './ui/Insignia';
import Tarjeta          from './ui/Tarjeta';
import EncabezadoPagina from './ui/EncabezadoPagina';
import EstadoVacio      from './ui/EstadoVacio';

// ── Tipos de movimiento ──────────────────────────────────────────────────────
const MOV_TONO: Record<string, 'exito' | 'neutro' | 'aviso'> = {
  entrada:    'exito',
  salida:     'neutro',
  ajuste:     'aviso',
  devolucion: 'neutro',
};
const MOV_LABEL: Record<string, string> = {
  entrada:    'Entrada',
  salida:     'Salida',
  ajuste:     'Ajuste',
  devolucion: 'Devolución',
};

function fmtFechaEC(iso: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// ── Encabezado de sección ────────────────────────────────────────────────────
function SeccionHeader({ tag, titulo }: { tag: string; titulo: string }) {
  return (
    <div className="mb-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-tinta-suave mb-0.5">{tag}</p>
      <h2 className="text-[13px] font-medium text-tinta">{titulo}</h2>
    </div>
  );
}

// ── Form de ingrediente ──────────────────────────────────────────────────────
type FormIngrediente = {
  ingredienteNombre:   string;
  ingredienteUnidad:   string;
  ingredienteStock:    string;
  ingredienteStockMin: string;
};

const FORM_VACIO: FormIngrediente = {
  ingredienteNombre: '', ingredienteUnidad: '', ingredienteStock: '0', ingredienteStockMin: '0',
};

// ── Componente ───────────────────────────────────────────────────────────────
export default function AdminInventario() {
  const { perfil } = useSesion();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [ingredientes, setIngredientes] = useState<IngredienteBase[]>([]);

  // Stock
  const [stock, setStock]               = useState<StockItem[]>([]);
  const [cargandoStock, setCargandoStock] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando]         = useState<StockItem | null>(null);
  const [form, setForm]                 = useState<FormIngrediente>(FORM_VACIO);
  const [guardandoForm, setGuardandoForm] = useState(false);

  // Entrada
  const [ingId, setIngId]       = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipoMov, setTipoMov]   = useState<'entrada' | 'ajuste'>('entrada');
  const [nota, setNota]         = useState('');
  const [guardandoEntrada, setGuardandoEntrada] = useState(false);

  // Movimientos
  const [movimientos, setMovimientos] = useState<MovimientoConDetalle[]>([]);
  const [filtroIng, setFiltroIng]     = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => fechaHoy());
  const [filtroHasta, setFiltroHasta] = useState(() => fechaHoy());
  const [cargandoMov, setCargandoMov] = useState(false);

  async function recargarStock() {
    setCargandoStock(true);
    try   { setStock(await listarStock()); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : String(e)); }
    finally   { setCargandoStock(false); }
  }

  async function cargarIngredientes() {
    try { setIngredientes(await listarIngredientesActivos()); } catch { /* no bloquea */ }
  }

  async function cargarMovimientos() {
    setCargandoMov(true);
    try {
      const { gte, lte } = rangoUTC(filtroDesde, filtroHasta);
      setMovimientos(await listarMovimientos({
        ingredienteId: filtroIng  || undefined,
        tipo:          filtroTipo || undefined,
        gte, lte,
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
    void cargarMovimientos();
  }, []);

  useEffect(() => { void cargarMovimientos(); }, [filtroIng, filtroTipo, filtroDesde, filtroHasta]);

  const alertaItems = stock.filter(s => s.stockDisponible <= s.ingredienteStockMin);

  // CRUD ingrediente
  function abrirNuevo() { setForm(FORM_VACIO); setEditando(null); setModalAbierto(true); }

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
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : String(e)); }
  }

  async function handleRegistrar() {
    if (!ingId) { setErrorMsg('Selecciona un ingrediente.'); return; }
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant === 0) { setErrorMsg('Ingresa una cantidad válida (distinta de cero).'); return; }
    if (tipoMov === 'entrada' && cant <= 0) { setErrorMsg('La cantidad de entrada debe ser positiva.'); return; }
    setGuardandoEntrada(true);
    setErrorMsg(null);
    try {
      await registrarMovimiento({
        ingredienteId: ingId, cantidad: cant, tipo: tipoMov,
        nota: nota.trim() || undefined, usuarioId: perfil!.perfilId,
      });
      setIngId(''); setCantidad(''); setNota('');
      await recargarStock();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoEntrada(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">

      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 bg-peligro text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold hover:opacity-70 text-lg leading-none">✕</button>
        </div>
      )}

      <EncabezadoPagina
        titulo="Inventario"
        subtitulo="Stock, ingresos, movimientos y recetas de cocina"
        acciones={<Boton variante="primario" onClick={abrirNuevo}>+ Nuevo ingrediente</Boton>}
      />

      {/* ══ Alertas de stock bajo ══ */}
      <div>
        <SeccionHeader tag="Alertas" titulo="Stock bajo mínimo" />
        {alertaItems.length === 0 ? (
          <Tarjeta>
            <EstadoVacio icono="✓" titulo="Todo el inventario está sobre el mínimo" />
          </Tarjeta>
        ) : (
          <Tarjeta acento>
            <div className="flex items-center gap-2 mb-3">
              <Insignia tono="aviso">{alertaItems.length} ingrediente(s) bajo mínimo</Insignia>
            </div>
            <div className="space-y-2">
              {alertaItems.map(s => {
                const enPeligro = s.stockDisponible <= 0;
                return (
                  <div key={s.ingredienteId} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-aviso-tinte flex items-center justify-center shrink-0">
                      <span className="text-aviso text-xs font-bold">!</span>
                    </div>
                    <span className="text-sm text-tinta flex-1">{s.ingredienteNombre}</span>
                    <span className={`text-sm font-medium ${enPeligro ? 'text-peligro' : 'text-aviso'}`}>
                      {s.stockDisponible} / {s.ingredienteStockMin} {s.ingredienteUnidad}
                    </span>
                  </div>
                );
              })}
            </div>
          </Tarjeta>
        )}
      </div>

      {/* ══ Tabla de stock ══ */}
      <div>
        <SeccionHeader tag="Inventario" titulo="Stock actual" />
        {cargandoStock ? (
          <Tarjeta><p className="text-sm text-tinta-media py-4 text-center">Cargando stock…</p></Tarjeta>
        ) : stock.length === 0 ? (
          <Tarjeta><EstadoVacio icono="📦" titulo="No hay ingredientes registrados" /></Tarjeta>
        ) : (
          <>
            {/* Desktop */}
            <Tarjeta sinPadding className="hidden md:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-linea">
                      {['Ingrediente', 'Unidad', 'Real', 'Comprometido', 'Disponible', 'Mínimo', 'Acciones'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-widest text-tinta-suave font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map(s => {
                      const enAlerta  = s.stockDisponible <= s.ingredienteStockMin;
                      const enPeligro = s.stockDisponible <= 0;
                      return (
                        <tr key={s.ingredienteId} className="border-b border-linea-suave last:border-0 hover:bg-linea-suave/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-tinta">{s.ingredienteNombre}</td>
                          <td className="px-4 py-3 text-tinta-media">{s.ingredienteUnidad}</td>
                          <td className="px-4 py-3 text-right text-tinta">{s.stockReal}</td>
                          <td className="px-4 py-3 text-right text-tinta-media">{s.comprometido}</td>
                          <td className={`px-4 py-3 text-right font-medium ${enPeligro ? 'text-peligro' : enAlerta ? 'text-aviso' : 'text-tinta'}`}>
                            {s.stockDisponible}
                          </td>
                          <td className="px-4 py-3 text-right text-tinta-suave">{s.ingredienteStockMin}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Boton variante="secundario" tamanio="sm" onClick={() => abrirEditar(s)}>Editar</Boton>
                              <Boton
                                variante={s.ingredienteActivo ? 'peligro' : 'secundario'}
                                tamanio="sm"
                                onClick={() => handleToggleActivo(s)}
                              >
                                {s.ingredienteActivo ? 'Desactivar' : 'Activar'}
                              </Boton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            {/* Móvil: etiqueta-valor apilado */}
            <div className="md:hidden space-y-3">
              {stock.map(s => {
                const enAlerta  = s.stockDisponible <= s.ingredienteStockMin;
                const enPeligro = s.stockDisponible <= 0;
                return (
                  <Tarjeta key={s.ingredienteId}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-medium text-tinta text-sm">{s.ingredienteNombre}</p>
                        <p className="text-[11px] text-tinta-suave mt-0.5">{s.ingredienteUnidad}</p>
                      </div>
                      {enAlerta && <Insignia tono={enPeligro ? 'peligro' : 'aviso'}>Stock bajo</Insignia>}
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Real</p>
                        <p className="text-sm font-medium text-tinta">{s.stockReal}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Comprometido</p>
                        <p className="text-sm text-tinta-media">{s.comprometido}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Disponible</p>
                        <p className={`text-sm font-medium ${enPeligro ? 'text-peligro' : enAlerta ? 'text-aviso' : 'text-tinta'}`}>{s.stockDisponible}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Mínimo</p>
                        <p className="text-sm text-tinta-suave">{s.ingredienteStockMin}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-3 border-t border-linea-suave">
                      <Boton variante="secundario" tamanio="sm" onClick={() => abrirEditar(s)} className="flex-1">Editar</Boton>
                      <Boton
                        variante={s.ingredienteActivo ? 'peligro' : 'secundario'}
                        tamanio="sm"
                        onClick={() => handleToggleActivo(s)}
                        className="flex-1"
                      >
                        {s.ingredienteActivo ? 'Desactivar' : 'Activar'}
                      </Boton>
                    </div>
                  </Tarjeta>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ══ Ingreso de mercadería ══ */}
      <div>
        <SeccionHeader tag="Operaciones" titulo="Registrar ingreso de mercadería" />
        <div className="max-w-lg border border-dashed border-linea rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-tinta-media mb-1">Ingrediente *</label>
            <select
              value={ingId}
              onChange={e => setIngId(e.target.value)}
              className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm bg-white focus:outline-none focus:ring-1 focus:ring-oro"
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
            <label className="block text-[12px] font-medium text-tinta-media mb-2">Tipo *</label>
            <div className="flex gap-6">
              {(['entrada', 'ajuste'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio" name="tipoMov" value={t}
                    checked={tipoMov === t}
                    onChange={() => { setTipoMov(t); setCantidad(''); }}
                    className="accent-oro"
                  />
                  <span className="text-sm text-tinta">
                    {t === 'entrada' ? 'Compra / Entrada' : 'Ajuste de conteo'}
                  </span>
                </label>
              ))}
            </div>
            {tipoMov === 'ajuste' && (
              <p className="text-xs text-tinta-suave mt-1.5">La cantidad puede ser negativa para corregir un sobrante.</p>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-medium text-tinta-media mb-1">
              Cantidad * {tipoMov === 'entrada' ? '(positiva)' : '(+ o −)'}
            </label>
            <input
              type="number" step="0.01"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              placeholder={tipoMov === 'entrada' ? '10' : '−3.5'}
              className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-tinta-media mb-1">Nota (opcional)</label>
            <input
              type="text"
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Ej. Factura #1234, proveedor XYZ"
              className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
            />
          </div>

          <Boton variante="primario" className="w-full" onClick={handleRegistrar} disabled={guardandoEntrada}>
            {guardandoEntrada ? 'Registrando…' : 'Registrar ingreso'}
          </Boton>
        </div>
      </div>

      {/* ══ Historial de movimientos ══ */}
      <div>
        <SeccionHeader tag="Historial" titulo="Movimientos de stock" />

        {/* Filtros */}
        <Tarjeta className="mb-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Ingrediente</label>
            <select
              value={filtroIng}
              onChange={e => setFiltroIng(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-linea bg-white text-sm focus:outline-none focus:ring-1 focus:ring-oro"
            >
              <option value="">Todos</option>
              {ingredientes.map(i => (
                <option key={i.ingredienteId} value={i.ingredienteId}>{i.ingredienteNombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Tipo</label>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-linea bg-white text-sm focus:outline-none focus:ring-1 focus:ring-oro"
            >
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
              <option value="devolucion">Devolución</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro" />
          </div>
        </Tarjeta>

        {cargandoMov ? (
          <Tarjeta><p className="text-sm text-tinta-media py-4 text-center">Cargando movimientos…</p></Tarjeta>
        ) : movimientos.length === 0 ? (
          <Tarjeta><EstadoVacio icono="📋" titulo="Sin movimientos para los filtros seleccionados" /></Tarjeta>
        ) : (
          <>
            {/* Desktop */}
            <Tarjeta sinPadding className="hidden md:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-linea">
                      {['Fecha/Hora', 'Ingrediente', 'Tipo', 'Cantidad', 'Usuario', 'Nota'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-widest text-tinta-suave font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => (
                      <tr key={m.movimientoId} className="border-b border-linea-suave last:border-0 hover:bg-linea-suave/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-tinta-suave whitespace-nowrap">{fmtFechaEC(m.movimientoCreadoEn)}</td>
                        <td className="px-4 py-3 font-medium text-tinta">
                          {m.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                          {m.ingredientes?.[0]?.ingredienteUnidad && (
                            <span className="ml-1 text-xs text-tinta-suave font-normal">({m.ingredientes[0].ingredienteUnidad})</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Insignia tono={MOV_TONO[m.movimientoTipo] ?? 'neutro'}>
                            {MOV_LABEL[m.movimientoTipo] ?? m.movimientoTipo}
                          </Insignia>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${m.movimientoCantidad < 0 ? 'text-peligro' : 'text-exito'}`}>
                          {m.movimientoCantidad > 0 ? '+' : ''}{m.movimientoCantidad}
                        </td>
                        <td className="px-4 py-3 text-tinta-media">{m.perfiles?.[0]?.perfilNombre ?? '—'}</td>
                        <td className="px-4 py-3 text-tinta-suave text-xs max-w-[180px] truncate" title={m.movimientoNota ?? ''}>{m.movimientoNota ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            {/* Móvil */}
            <div className="md:hidden space-y-3">
              {movimientos.map(m => (
                <Tarjeta key={m.movimientoId}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="font-medium text-tinta text-sm">
                      {m.ingredientes?.[0]?.ingredienteNombre ?? '—'}
                      {m.ingredientes?.[0]?.ingredienteUnidad && (
                        <span className="ml-1 text-xs text-tinta-suave font-normal">({m.ingredientes[0].ingredienteUnidad})</span>
                      )}
                    </p>
                    <Insignia tono={MOV_TONO[m.movimientoTipo] ?? 'neutro'}>
                      {MOV_LABEL[m.movimientoTipo] ?? m.movimientoTipo}
                    </Insignia>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-linea-suave pt-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Fecha</p>
                      <p className="text-xs text-tinta-media">{fmtFechaEC(m.movimientoCreadoEn)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Cantidad</p>
                      <p className={`text-sm font-medium ${m.movimientoCantidad < 0 ? 'text-peligro' : 'text-exito'}`}>
                        {m.movimientoCantidad > 0 ? '+' : ''}{m.movimientoCantidad}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Usuario</p>
                      <p className="text-xs text-tinta-media">{m.perfiles?.[0]?.perfilNombre ?? '—'}</p>
                    </div>
                    {m.movimientoNota && (
                      <div className="col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-tinta-suave">Nota</p>
                        <p className="text-xs text-tinta-suave">{m.movimientoNota}</p>
                      </div>
                    )}
                  </div>
                </Tarjeta>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══ Recetas ══ */}
      <div>
        <SeccionHeader tag="Cocina" titulo="Editor de recetas" />
        <AdminRecetas />
      </div>

      {/* ── Modal CRUD ingrediente ── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-carbon/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setModalAbierto(false)}
          onKeyDown={e => e.key === 'Escape' && setModalAbierto(false)}
        >
          <div
            className="bg-tarjeta rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden max-h-[95svh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-linea shrink-0">
              <h3 className="text-[16px] font-medium text-tinta">
                {editando ? 'Editar ingrediente' : 'Nuevo ingrediente'}
              </h3>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-[12px] font-medium text-tinta-media mb-1">Nombre *</label>
                <input type="text" value={form.ingredienteNombre}
                  onChange={e => setForm(f => ({ ...f, ingredienteNombre: e.target.value }))}
                  placeholder="Ej. Tomate"
                  className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-tinta-media mb-1">Unidad *</label>
                <input type="text" value={form.ingredienteUnidad}
                  onChange={e => setForm(f => ({ ...f, ingredienteUnidad: e.target.value }))}
                  placeholder="Ej. kg, L, unidad, porción"
                  className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-tinta-media mb-1">Stock actual</label>
                  <input type="number" step="0.01" min="0" value={form.ingredienteStock}
                    onChange={e => setForm(f => ({ ...f, ingredienteStock: e.target.value }))}
                    className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-tinta-media mb-1">Stock mínimo</label>
                  <input type="number" step="0.01" min="0" value={form.ingredienteStockMin}
                    onChange={e => setForm(f => ({ ...f, ingredienteStockMin: e.target.value }))}
                    className="w-full h-[44px] px-3 rounded-lg border border-linea text-sm focus:outline-none focus:ring-1 focus:ring-oro"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-linea flex justify-end gap-3 shrink-0">
              <Boton variante="secundario" onClick={() => setModalAbierto(false)}>Cancelar</Boton>
              <Boton variante="primario"   onClick={guardarForm} disabled={guardandoForm}>
                {guardandoForm ? 'Guardando…' : 'Guardar ingrediente'}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
