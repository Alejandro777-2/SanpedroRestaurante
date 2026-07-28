import { useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { exportarExcel, exportarPDF, fmtFecha, fechaHoy, rangoUTC, type Hoja } from '../lib/exportar';
import Boton           from './ui/Boton';
import Tarjeta         from './ui/Tarjeta';
import EncabezadoPagina from './ui/EncabezadoPagina';
import EstadoVacio     from './ui/EstadoVacio';

// ── Timezone ────────────────────────────────────────────────────────────────
const EC_TZ = 'America/Guayaquil';

function localFecha(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EC_TZ }).format(new Date(iso));
}

function localHora(iso: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en', { timeZone: EC_TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso))
  );
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ResumenGeneral { totalPedidos: number; ingresoTotal: number; ticketPromedio: number; }
interface VentaCategoria { platilloCategoria: string; unidadesVendidas: number; ingresoTotal: number; }
interface VentaDia       { dia: string; numeroPedidos: number; ingresoTotal: number; ticketPromedio: number; }
interface VentaPlatillo  { platilloId: string; platilloNombre: string; platilloCategoria: string; unidadesVendidas: number; ingresoTotal: number; }
interface VentaHora      { hora: number; numeroPedidos: number; ingresoTotal: number; }
interface VentaMesero    { perfilNombre: string; numeroPedidos: number; ingresoTotal: number; ticketPromedio: number; }

type DetallePedidoRaw = {
  detallePedidoPlatilloId: string;
  detallePedidoCantidad: number;
  detallePedidoPrecioUnitario: number;
  platillos: { platilloNombre: string; platilloCategoria: string }[];
};

type PedidoRaw = {
  pedidoId: string;
  pedidoTotal: number;
  pedidoCreadoEn: string;
  perfiles: { perfilNombre: string }[];
  detallesPedido: DetallePedidoRaw[];
};

interface CajaDia         { dia: string; efectivo: number; transferencia: number; }
interface CajaResumenFila { cajaFecha: string; cajaEfectivo: number; cajaTransferencia: number; }

// ── Agregación en cliente (timezone-correcta) ────────────────────────────────
function computarMetricas(pedidos: PedidoRaw[]) {
  const totalPedidos = pedidos.length;
  const ingresoTotal = pedidos.reduce((s, p) => s + p.pedidoTotal, 0);
  const resumen: ResumenGeneral = {
    totalPedidos,
    ingresoTotal,
    ticketPromedio: totalPedidos > 0 ? ingresoTotal / totalPedidos : 0,
  };

  const catMap = new Map<string, { unidadesVendidas: number; ingresoTotal: number }>();
  for (const p of pedidos) {
    for (const d of p.detallesPedido) {
      const cat  = d.platillos?.[0]?.platilloCategoria ?? 'Sin categoría';
      const prev = catMap.get(cat) ?? { unidadesVendidas: 0, ingresoTotal: 0 };
      catMap.set(cat, {
        unidadesVendidas: prev.unidadesVendidas + d.detallePedidoCantidad,
        ingresoTotal:     prev.ingresoTotal + d.detallePedidoCantidad * d.detallePedidoPrecioUnitario,
      });
    }
  }
  const porCategoria: VentaCategoria[] = [...catMap.entries()]
    .map(([platilloCategoria, v]) => ({ platilloCategoria, ...v }))
    .sort((a, b) => b.ingresoTotal - a.ingresoTotal);

  const diaMap = new Map<string, { numeroPedidos: number; ingresoTotal: number }>();
  for (const p of pedidos) {
    const dia  = localFecha(p.pedidoCreadoEn);
    const prev = diaMap.get(dia) ?? { numeroPedidos: 0, ingresoTotal: 0 };
    diaMap.set(dia, { numeroPedidos: prev.numeroPedidos + 1, ingresoTotal: prev.ingresoTotal + p.pedidoTotal });
  }
  const porDia: VentaDia[] = [...diaMap.entries()]
    .map(([dia, v]) => ({ dia, numeroPedidos: v.numeroPedidos, ingresoTotal: v.ingresoTotal, ticketPromedio: v.ingresoTotal / v.numeroPedidos }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  const platMap = new Map<string, VentaPlatillo>();
  for (const p of pedidos) {
    for (const d of p.detallesPedido) {
      const id     = d.detallePedidoPlatilloId;
      const nombre = d.platillos?.[0]?.platilloNombre ?? id;
      const cat    = d.platillos?.[0]?.platilloCategoria ?? '—';
      const prev   = platMap.get(id) ?? { platilloId: id, platilloNombre: nombre, platilloCategoria: cat, unidadesVendidas: 0, ingresoTotal: 0 };
      platMap.set(id, {
        ...prev,
        unidadesVendidas: prev.unidadesVendidas + d.detallePedidoCantidad,
        ingresoTotal:     prev.ingresoTotal + d.detallePedidoCantidad * d.detallePedidoPrecioUnitario,
      });
    }
  }
  const porPlatillo: VentaPlatillo[] = [...platMap.values()]
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
    .slice(0, 10);

  const horaMap = new Map<number, { numeroPedidos: number; ingresoTotal: number }>();
  for (const p of pedidos) {
    const hora = localHora(p.pedidoCreadoEn);
    const prev = horaMap.get(hora) ?? { numeroPedidos: 0, ingresoTotal: 0 };
    horaMap.set(hora, { numeroPedidos: prev.numeroPedidos + 1, ingresoTotal: prev.ingresoTotal + p.pedidoTotal });
  }
  const porHora: VentaHora[] = [...horaMap.entries()]
    .map(([hora, v]) => ({ hora, ...v }))
    .sort((a, b) => a.hora - b.hora);

  const meseroMap = new Map<string, { perfilNombre: string; numeroPedidos: number; ingresoTotal: number }>();
  for (const p of pedidos) {
    const nombre = p.perfiles?.[0]?.perfilNombre ?? 'Sin asignar';
    const prev   = meseroMap.get(nombre) ?? { perfilNombre: nombre, numeroPedidos: 0, ingresoTotal: 0 };
    meseroMap.set(nombre, { ...prev, numeroPedidos: prev.numeroPedidos + 1, ingresoTotal: prev.ingresoTotal + p.pedidoTotal });
  }
  const porMesero: VentaMesero[] = [...meseroMap.values()]
    .map(v => ({ ...v, ticketPromedio: v.ingresoTotal / v.numeroPedidos }))
    .sort((a, b) => b.ingresoTotal - a.ingresoTotal);

  return { resumen, porCategoria, porDia, porPlatillo, porHora, porMesero };
}

// ── Presets ──────────────────────────────────────────────────────────────────
type Preset = 'hoy' | '7dias' | 'mes' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  hoy:    'Hoy',
  '7dias': 'Últimos 7 días',
  mes:    'Este mes',
  custom: 'Personalizado',
};

function calcPresetRango(p: Exclude<Preset, 'custom'>): { desde: string; hasta: string } {
  const hoy = fechaHoy();
  if (p === 'hoy') return { desde: hoy, hasta: hoy };
  if (p === '7dias') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const desde = new Intl.DateTimeFormat('en-CA', { timeZone: EC_TZ }).format(d);
    return { desde, hasta: hoy };
  }
  const [y, m] = hoy.split('-');
  return { desde: `${y}-${m}-01`, hasta: hoy };
}

function formatFechaDisplay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}

// ── Colores para Recharts (valores canónicos de los tokens) ──────────────────
const ORO        = '#C9A227';
const TINTA_SUAVE = '#9A9382';

function fmt$(n: number) { return `$${Number(n).toFixed(2)}`; }

// ── Componente ───────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [preset, setPreset]               = useState<Preset>('hoy');
  const [fechaDesde, setFechaDesde]       = useState(() => fechaHoy());
  const [fechaHasta, setFechaHasta]       = useState(() => fechaHoy());
  const [refreshKey, setRefreshKey]       = useState(0);

  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [resumen, setResumen]             = useState<ResumenGeneral | null>(null);
  const [porCategoria, setPorCategoria]   = useState<VentaCategoria[]>([]);
  const [porDia, setPorDia]               = useState<VentaDia[]>([]);
  const [porPlatillo, setPorPlatillo]     = useState<VentaPlatillo[]>([]);
  const [porHora, setPorHora]             = useState<VentaHora[]>([]);
  const [porMesero, setPorMesero]         = useState<VentaMesero[]>([]);
  const [efectivoTotal, setEfectivoTotal]               = useState(0);
  const [transferenciaTotal, setTransferenciaTotal]     = useState(0);
  const [cajaTotal, setCajaTotal]                       = useState(0);
  const [cajaPorDia, setCajaPorDia]                     = useState<CajaDia[]>([]);
  const [generando, setGenerando]         = useState(false);
  const [errorExport, setErrorExport]     = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function cargarMetricas() {
    setCargando(true);
    setError(null);
    try {
      const { gte, lte } = rangoUTC(fechaDesde, fechaHasta);
      const { data, error: err } = await supabase
        .from('pedidos')
        .select(`
          pedidoId, pedidoTotal, pedidoCreadoEn,
          perfiles ( perfilNombre ),
          detallesPedido (
            detallePedidoPlatilloId, detallePedidoCantidad, detallePedidoPrecioUnitario,
            platillos ( platilloNombre, platilloCategoria )
          )
        `)
        .gte('pedidoCreadoEn', gte)
        .lte('pedidoCreadoEn', lte);

      if (err) throw new Error(err.message);

      const m = computarMetricas((data ?? []) as PedidoRaw[]);
      setResumen(m.resumen);
      setPorCategoria(m.porCategoria);
      setPorDia(m.porDia);
      setPorPlatillo(m.porPlatillo);
      setPorHora(m.porHora);
      setPorMesero(m.porMesero);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  async function cargarCaja() {
    const { data } = await supabase
      .from('vistaCajaResumen')
      .select('cajaFecha, cajaEfectivo, cajaTransferencia')
      .gte('cajaFecha', fechaDesde)
      .lte('cajaFecha', fechaHasta)
      .order('cajaFecha', { ascending: true });
    const filas = (data ?? []) as CajaResumenFila[];
    const ef  = filas.reduce((s, r) => s + Number(r.cajaEfectivo),     0);
    const tr  = filas.reduce((s, r) => s + Number(r.cajaTransferencia), 0);
    setEfectivoTotal(ef);
    setTransferenciaTotal(tr);
    setCajaTotal(ef + tr);
    setCajaPorDia(filas.map(r => ({ dia: r.cajaFecha, efectivo: Number(r.cajaEfectivo), transferencia: Number(r.cajaTransferencia) })));
  }

  useEffect(() => {
    void cargarMetricas();
    void cargarCaja();
  }, [fechaDesde, fechaHasta, refreshKey]);

  useEffect(() => {
    const canal = supabase
      .channel('pedidos-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setRefreshKey(k => k + 1), 800);
      })
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(canal);
    };
  }, []);

  function seleccionarPreset(p: Preset) {
    if (p === 'custom') { setPreset('custom'); return; }
    const { desde, hasta } = calcPresetRango(p);
    setPreset(p);
    setFechaDesde(desde);
    setFechaHasta(hasta);
  }

  const rangoLabel = fechaDesde === fechaHasta
    ? formatFechaDisplay(fechaDesde)
    : `Del ${formatFechaDisplay(fechaDesde)} al ${formatFechaDisplay(fechaHasta)}`;

  async function handleExportarExcel() {
    setGenerando(true);
    setErrorExport(null);
    try {
      const hojas: Hoja[] = [
        {
          nombre: 'Resumen General',
          columnas: ['Indicador', 'Valor'],
          filas: [
            ['Período',          rangoLabel],
            ['Generado',         fmtFecha(new Date().toISOString())],
            ['', ''],
            ['Total de Pedidos', resumen?.totalPedidos ?? 0],
            ['Ingreso Total',    resumen?.ingresoTotal ?? 0],
            ['Ticket Promedio',  resumen?.ticketPromedio ?? 0],
          ],
        },
        {
          nombre: 'Por Categoría',
          columnas: ['Categoría', 'Unidades Vendidas', 'Ingreso Total'],
          filas: porCategoria.map(r => [r.platilloCategoria, r.unidadesVendidas, r.ingresoTotal]),
        },
        {
          nombre: 'Por Día',
          columnas: ['Día', 'Pedidos', 'Ingreso Total', 'Ticket Promedio'],
          filas: porDia.map(r => [r.dia, r.numeroPedidos, r.ingresoTotal, r.ticketPromedio]),
        },
        {
          nombre: 'Top 10 Platillos',
          columnas: ['Platillo', 'Categoría', 'Unidades', 'Ingreso Total'],
          filas: porPlatillo.map(r => [r.platilloNombre, r.platilloCategoria, r.unidadesVendidas, r.ingresoTotal]),
        },
        {
          nombre: 'Por Hora',
          columnas: ['Hora', 'Pedidos', 'Ingreso Total'],
          filas: porHora.map(r => [r.hora, r.numeroPedidos, r.ingresoTotal]),
        },
        {
          nombre: 'Por Mesero',
          columnas: ['Mesero', 'Pedidos', 'Ingreso Total', 'Ticket Promedio'],
          filas: porMesero.map(r => [r.perfilNombre, r.numeroPedidos, r.ingresoTotal, r.ticketPromedio]),
        },
        {
          nombre: 'Cobros por Método',
          columnas: ['Método', 'Total'],
          filas: [
            ['Efectivo',       efectivoTotal],
            ['Transferencia',  transferenciaTotal],
            ['', ''],
            ['Total Cobrado',  cajaTotal],
          ],
        },
      ];
      await exportarExcel(`SanPedro_Dashboard_${fechaHoy()}.xlsx`, hojas);
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setGenerando(false);
    }
  }

  function handleExportarPDF() {
    setGenerando(true);
    setErrorExport(null);
    try {
      exportarPDF(
        'Dashboard',
        rangoLabel,
        [
          {
            nombre: 'Ventas por Categoría',
            columnas: ['Categoría', 'Unidades Vendidas', 'Ingreso Total'],
            filas: porCategoria.map(r => [r.platilloCategoria, r.unidadesVendidas, fmt$(r.ingresoTotal)]),
          },
          {
            nombre: 'Ventas por Día',
            columnas: ['Día', 'Pedidos', 'Ingreso Total', 'Ticket Promedio'],
            filas: porDia.map(r => [r.dia, r.numeroPedidos, fmt$(r.ingresoTotal), fmt$(r.ticketPromedio)]),
          },
          {
            nombre: 'Top 10 Platillos',
            columnas: ['Platillo', 'Categoría', 'Unidades', 'Ingreso Total'],
            filas: porPlatillo.map(r => [r.platilloNombre, r.platilloCategoria, r.unidadesVendidas, fmt$(r.ingresoTotal)]),
          },
          {
            nombre: 'Ventas por Hora',
            columnas: ['Hora', 'Pedidos', 'Ingreso Total'],
            filas: porHora.map(r => [r.hora, r.numeroPedidos, fmt$(r.ingresoTotal)]),
          },
          {
            nombre: 'Ventas por Mesero',
            columnas: ['Mesero', 'Pedidos', 'Ingreso Total', 'Ticket Promedio'],
            filas: porMesero.map(r => [r.perfilNombre, r.numeroPedidos, fmt$(r.ingresoTotal), fmt$(r.ticketPromedio)]),
          },
          {
            nombre: 'Cobros por Método',
            columnas: ['Método', 'Total'],
            filas: [
              ['Efectivo',      fmt$(efectivoTotal)],
              ['Transferencia', fmt$(transferenciaTotal)],
              ['Total Cobrado', fmt$(cajaTotal)],
            ],
          },
        ],
        resumen ? [
          { label: 'Total de Pedidos',  valor: String(resumen.totalPedidos) },
          { label: 'Ingreso Total',     valor: fmt$(resumen.ingresoTotal) },
          { label: 'Ticket Promedio',   valor: fmt$(resumen.ticketPromedio) },
          { label: 'Efectivo en Caja',  valor: fmt$(efectivoTotal) },
          { label: 'En Transferencias', valor: fmt$(transferenciaTotal) },
          { label: 'Total Cobrado',     valor: fmt$(cajaTotal) },
        ] : undefined
      );
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : 'Error al exportar.');
    } finally {
      setGenerando(false);
    }
  }

  // ── Estados tempranos ────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-tinta-media text-sm">Cargando métricas…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <Tarjeta className="text-peligro text-sm">Error al cargar métricas: {error}</Tarjeta>
      </div>
    );
  }

  // ── Vista principal ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">

      {/* ── Encabezado ── */}
      <EncabezadoPagina
        titulo="Dashboard"
        subtitulo={rangoLabel}
        acciones={
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-exito animate-pulse" />
              <span className="text-[11px] font-medium text-exito uppercase tracking-widest">En vivo</span>
            </span>
            {errorExport && <span className="text-[11px] text-peligro">{errorExport}</span>}
            <Boton variante="secundario" tamanio="sm" onClick={handleExportarExcel} disabled={generando}>
              {generando ? '…' : 'Excel'}
            </Boton>
            <Boton variante="secundario" tamanio="sm" onClick={handleExportarPDF} disabled={generando}>
              {generando ? '…' : 'PDF'}
            </Boton>
          </>
        }
      />

      {/* ── Selector de rango ── */}
      <Tarjeta className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['hoy', '7dias', 'mes', 'custom'] as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => seleccionarPreset(p)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-150 ${
                preset === p
                  ? 'bg-oro text-carbon'
                  : 'bg-linea-suave text-tinta-media hover:bg-linea'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-3">
          <input
            type="date"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPreset('custom'); }}
            className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
          />
          <span className="text-tinta-suave text-xs">—</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPreset('custom'); }}
            className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
          />
        </div>
      </Tarjeta>

      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta destacada>
          <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Ingreso Total</p>
          <p className="text-3xl font-medium text-oro-tinta tracking-tight">{fmt$(resumen?.ingresoTotal ?? 0)}</p>
          <p className="text-[11px] text-tinta-suave mt-1">{rangoLabel}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Total de Pedidos</p>
          <p className="text-3xl font-medium text-tinta tracking-tight">{resumen?.totalPedidos ?? 0}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Ticket Promedio</p>
          <p className="text-3xl font-medium text-tinta tracking-tight">{fmt$(resumen?.ticketPromedio ?? 0)}</p>
        </Tarjeta>
      </div>

      {/* ── KPI caja ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Tarjeta>
          <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-1">Efectivo en Caja</p>
          <p className="text-3xl font-medium text-exito tracking-tight">{fmt$(efectivoTotal)}</p>
          <p className="text-[11px] text-tinta-suave mt-1">Total cobrado: {fmt$(cajaTotal)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-1">En Transferencias</p>
          <p className="text-3xl font-medium text-tinta tracking-tight">{fmt$(transferenciaTotal)}</p>
          <p className="text-[11px] text-tinta-suave mt-1">Total cobrado: {fmt$(cajaTotal)}</p>
        </Tarjeta>
      </div>

      {/* ── Gráficas: Categoría + Diario ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

        <Tarjeta className="flex flex-col">
          <h2 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest mb-4 shrink-0">
            Ingreso por Categoría
          </h2>
          <div className="flex-1 min-h-[260px] flex items-center justify-center">
            {porCategoria.length === 0
              ? <EstadoVacio icono="📊" titulo="Sin datos para el período" />
              : (() => {
                  const rotar = porCategoria.length > 3;
                  return (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={porCategoria}
                        margin={{ top: 4, right: 16, left: 8, bottom: rotar ? 52 : 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D8" />
                        <XAxis
                          dataKey="platilloCategoria"
                          tick={{ fontSize: 11 }}
                          angle={rotar ? -35 : 0}
                          textAnchor={rotar ? 'end' : 'middle'}
                          interval={0}
                        />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
                        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Ingreso']} />
                        <Bar dataKey="ingresoTotal" fill={ORO} radius={[4, 4, 0, 0]} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()
            }
          </div>
        </Tarjeta>

        <Tarjeta className="flex flex-col">
          <h2 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest mb-4 shrink-0">
            Ingreso Diario
          </h2>
          <div className="flex-1 min-h-[260px] flex items-center justify-center">
            {porDia.length === 0
              ? <EstadoVacio icono="📈" titulo="Sin datos para el período" />
              : porDia.length === 1
                ? (
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span className="text-3xl font-medium text-oro-tinta tracking-tight">{fmt$(porDia[0].ingresoTotal)}</span>
                    <p className="text-xs text-tinta-suave">{porDia[0].dia} · {porDia[0].numeroPedidos} pedido(s)</p>
                    <p className="text-[10px] text-tinta-suave mt-1">Se necesitan al menos 2 días para mostrar la tendencia</p>
                  </div>
                )
                : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={porDia} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D8" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Ingreso']} />
                      <Line
                        type="monotone"
                        dataKey="ingresoTotal"
                        stroke={ORO}
                        strokeWidth={2}
                        dot={{ fill: ORO, r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: ORO }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )
            }
          </div>
        </Tarjeta>

      </div>

      {/* ── Cobros por día ── */}
      <Tarjeta className="flex flex-col">
        <h2 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest mb-4 shrink-0">
          Cobros por Día (Efectivo vs. Transferencia)
        </h2>
        <div className="flex-1 min-h-[260px] flex items-center justify-center">
          {cajaPorDia.length === 0
            ? <EstadoVacio icono="💳" titulo="Sin cobros en el período" />
            : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cajaPorDia} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D8" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`]} />
                  <Legend />
                  <Bar dataKey="efectivo"      name="Efectivo"      stackId="caja" fill={ORO} />
                  <Bar dataKey="transferencia" name="Transferencia" stackId="caja" fill={TINTA_SUAVE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </Tarjeta>

      {/* ── Top 10 platillos ── */}
      <Tarjeta sinPadding className="overflow-hidden">
        <div className="px-[14px] py-3 border-b border-linea">
          <h2 className="text-[11px] font-semibold text-tinta-media uppercase tracking-widest">
            Top 10 Platillos Más Vendidos
          </h2>
        </div>
        {porPlatillo.length === 0
          ? (
            <div className="px-[14px] py-3">
              <EstadoVacio icono="🍽" titulo="Sin ventas en el período" />
            </div>
          )
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-carbon text-white text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">#</th>
                    <th className="text-left px-4 py-3 font-semibold">Platillo</th>
                    <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                    <th className="text-right px-4 py-3 font-semibold">Unidades</th>
                    <th className="text-right px-4 py-3 font-semibold">Ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea bg-tarjeta">
                  {porPlatillo.map((p, i) => (
                    <tr key={p.platilloId} className="hover:bg-linea-suave transition-colors">
                      <td className="px-4 py-3 text-tinta-suave font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-tinta">{p.platilloNombre}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-tinta-suave whitespace-nowrap">
                          {p.platilloCategoria}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-tinta">{p.unidadesVendidas}</td>
                      <td className="px-4 py-3 text-right font-medium text-oro-tinta whitespace-nowrap">{fmt$(p.ingresoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Tarjeta>

    </div>
  );
}
