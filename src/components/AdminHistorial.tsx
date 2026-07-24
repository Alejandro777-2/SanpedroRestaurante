import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { exportarExcel, exportarPDF, fmtFecha, fechaHoy, rangoUTC, type Hoja, type Seccion } from '../lib/exportar';

type PedidoHistorial = {
  pedidoId: string;
  pedidoMesa: string | null;
  pedidoClienteNombre: string | null;
  pedidoTotal: number;
  pedidoEstado: string;
  pedidoCreadoEn: string;
  pedidoMetodoPago: string | null;
  perfiles: { perfilNombre: string }[];
};

type Mesero = { perfilId: string; perfilNombre: string };

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const ESTADO_CLASE: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  entregado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
};

const COLS = ['Fecha/Hora', 'Mesa', 'Cliente', 'Mesero', 'Estado', 'Método de pago', 'Total'];

function fmt$(n: number) { return `$${n.toFixed(2)}`; }

export default function AdminHistorial() {
  const hoy = fechaHoy();

  const [pedidos, setPedidos]           = useState<PedidoHistorial[]>([]);
  const [meseros, setMeseros]           = useState<Mesero[]>([]);
  const [fechaDesde, setFechaDesde]     = useState(hoy);
  const [fechaHasta, setFechaHasta]     = useState(hoy);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [meseroFiltro, setMeseroFiltro] = useState('');
  const [cargando, setCargando]         = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [generando, setGenerando]       = useState(false);

  async function cargarMeseros() {
    const { data } = await supabase
      .from('perfiles')
      .select('perfilId, perfilNombre')
      .eq('perfilRol', 'mesero')
      .eq('perfilActivo', true);
    if (data) setMeseros(data as Mesero[]);
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { gte, lte } = rangoUTC(fechaDesde, fechaHasta);
      let q = supabase
        .from('pedidos')
        .select(`
          pedidoId, pedidoMesa, pedidoClienteNombre, pedidoTotal, pedidoEstado, pedidoCreadoEn, pedidoMetodoPago,
          perfiles ( perfilNombre )
        `)
        .gte('pedidoCreadoEn', gte)
        .lte('pedidoCreadoEn', lte)
        .order('pedidoCreadoEn', { ascending: false });

      if (estadoFiltro) q = q.eq('pedidoEstado', estadoFiltro);
      if (meseroFiltro) q = q.eq('pedidoMeseroId', meseroFiltro);

      const { data, error: err } = await q;
      if (err) throw new Error(err.message);
      setPedidos((data ?? []) as PedidoHistorial[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargarMeseros(); }, []);
  useEffect(() => { void cargar(); }, [fechaDesde, fechaHasta, estadoFiltro, meseroFiltro]);

  const totalSuma          = pedidos.reduce((s, p) => s + p.pedidoTotal, 0);
  const totalEfectivo      = pedidos.filter(p => p.pedidoMetodoPago === 'efectivo').reduce((s, p) => s + p.pedidoTotal, 0);
  const totalTransferencia = pedidos.filter(p => p.pedidoMetodoPago === 'transferencia').reduce((s, p) => s + p.pedidoTotal, 0);

  async function handleExportarExcel() {
    setGenerando(true);
    setError(null);
    try {
      const hoja: Hoja = {
        nombre: 'Historial',
        columnas: COLS,
        filas: [
          ...pedidos.map(p => [
            fmtFecha(p.pedidoCreadoEn),
            p.pedidoMesa ?? '',
            p.pedidoClienteNombre ?? '',
            p.perfiles?.[0]?.perfilNombre ?? '',
            ESTADO_LABEL[p.pedidoEstado] ?? p.pedidoEstado,
            p.pedidoMetodoPago ?? '',
            p.pedidoTotal,
          ]),
          ['', '', '', '', '', 'TOTAL',          totalSuma],
          ['', '', '', '', '', 'Efectivo',        totalEfectivo],
          ['', '', '', '', '', 'Transferencia',   totalTransferencia],
        ],
      };
      await exportarExcel(`SanPedro_Historial_${fechaHoy()}.xlsx`, [hoja]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setGenerando(false);
    }
  }

  function handleExportarPDF() {
    setGenerando(true);
    setError(null);
    try {
      const seccion: Seccion = {
        nombre: 'Historial de Pedidos',
        columnas: COLS,
        filas: [
          ...pedidos.map(p => [
            fmtFecha(p.pedidoCreadoEn),
            p.pedidoMesa ?? '—',
            p.pedidoClienteNombre ?? '—',
            p.perfiles?.[0]?.perfilNombre ?? '—',
            ESTADO_LABEL[p.pedidoEstado] ?? p.pedidoEstado,
            p.pedidoMetodoPago ?? '—',
            fmt$(p.pedidoTotal),
          ]),
          ['', '', '', '', '', 'TOTAL',          fmt$(totalSuma)],
          ['', '', '', '', '', 'Efectivo',        fmt$(totalEfectivo)],
          ['', '', '', '', '', 'Transferencia',   fmt$(totalTransferencia)],
        ],
      };
      exportarPDF(
        'Historial de Pedidos',
        `Del ${fechaDesde} al ${fechaHasta}`,
        [seccion]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 bg-[#FAFAF6] min-h-[60vh]">

      {/* ── Filtros + export ── */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 sm:gap-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Estado</label>
          <select
            value={estadoFiltro}
            onChange={e => setEstadoFiltro(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="entregado">Entregado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        {meseros.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-sanpedro-wood uppercase tracking-wide mb-1">Mesero</label>
            <select
              value={meseroFiltro}
              onChange={e => setMeseroFiltro(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-sanpedro-gold/40 bg-white focus:outline-none focus:ring-2 focus:ring-sanpedro-gold"
            >
              <option value="">Todos</option>
              {meseros.map(m => (
                <option key={m.perfilId} value={m.perfilId}>{m.perfilNombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2 flex gap-2 sm:ml-auto">
          <button
            onClick={handleExportarExcel}
            disabled={generando || pedidos.length === 0}
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {generando ? '…' : 'Excel'}
          </button>
          <button
            onClick={handleExportarPDF}
            disabled={generando || pedidos.length === 0}
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {generando ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Tabla ── */}
      {cargando ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-sanpedro-wood font-medium tracking-wide">Cargando historial…</p>
        </div>
      ) : pedidos.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 text-sm">Sin pedidos para los filtros seleccionados.</p>
        </div>
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sanpedro-wood text-white text-xs uppercase tracking-wide">
                    {COLS.map(c => (
                      <th key={c} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {pedidos.map(p => (
                    <tr key={p.pedidoId} className="hover:bg-sanpedro-wood-light/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtFecha(p.pedidoCreadoEn)}</td>
                      <td className="px-4 py-3 font-bold text-sanpedro-gold">{p.pedidoMesa ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.pedidoClienteNombre ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.perfiles?.[0]?.perfilNombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${ESTADO_CLASE[p.pedidoEstado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ESTADO_LABEL[p.pedidoEstado] ?? p.pedidoEstado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-500 capitalize whitespace-nowrap">{p.pedidoMetodoPago ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-sanpedro-wood whitespace-nowrap">{fmt$(p.pedidoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-sanpedro-wood/10">
                    <td colSpan={6} className="px-4 py-3 text-right text-xs font-semibold text-sanpedro-wood uppercase tracking-wide">
                      Total — {pedidos.length} pedido(s)
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-sanpedro-wood whitespace-nowrap">
                      {fmt$(totalSuma)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Móvil: tarjetas */}
          <div className="md:hidden space-y-2">
            {pedidos.map(p => (
              <div key={p.pedidoId} className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-sanpedro-gold text-lg leading-tight">{p.pedidoMesa ?? '—'}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{fmtFecha(p.pedidoCreadoEn)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sanpedro-wood">{fmt$(p.pedidoTotal)}</p>
                    <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_CLASE[p.pedidoEstado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ESTADO_LABEL[p.pedidoEstado] ?? p.pedidoEstado}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3">
                  {p.pedidoClienteNombre && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Cliente</p>
                      <p className="text-xs text-stone-500">{p.pedidoClienteNombre}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Mesero</p>
                    <p className="text-xs text-stone-500">{p.perfiles?.[0]?.perfilNombre ?? '—'}</p>
                  </div>
                  {p.pedidoMetodoPago && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Método</p>
                      <p className="text-xs capitalize text-stone-500">{p.pedidoMetodoPago}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="bg-sanpedro-wood/10 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-semibold text-sanpedro-wood uppercase tracking-wide">{pedidos.length} pedido(s)</span>
              <span className="font-bold text-sanpedro-wood">{fmt$(totalSuma)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
