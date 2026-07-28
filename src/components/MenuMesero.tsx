import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { type Platillo, type LineaCarrito, type PlatilloAgrupadoUI, type DetallePedido } from '../types';
import { confirmarPedido } from '../lib/confirmarPedido';
import { fechaHoy, rangoUTC } from '../lib/exportar';
import Boton      from './ui/Boton';
import Insignia   from './ui/Insignia';
import Tarjeta    from './ui/Tarjeta';
import EstadoVacio from './ui/EstadoVacio';

type MenuItemUI = Platillo | PlatilloAgrupadoUI;

type DetComanda = {
  detallePedidoCantidad: number;
  detallePedidoPlatilloNombre: string | null;
  detallePedidoPlatilloDescripcion: string | null;
  platillos: {
    recetas: { ingredientes: { ingredienteNombre: string }[] }[];
  }[];
};

type PedidoConDetalle = {
  pedidoId: string;
  pedidoMesa: string | null;
  pedidoClienteNombre: string | null;
  pedidoTotal: number;
  pedidoEstado: string;
  pedidoCreadoEn: string;
  pedidoMetodoPago: string | null;
  pedidoPagadoEn: string | null;
  pedidoObservacion: string | null;
  detallesPedido: DetallePedido[];
};

type PedidoCobro = {
  pedidoId: string;
  pedidoEntregadoEn: string;
  pendienteTotal: number;
  pedidoMesa: string | null;
  pedidoMeseroNombre: string | null;
  pedidoClienteNombre: string | null;
};

type ComandaData = {
  pedidoId: string;
  mesa: string;
  hora: string;
  observacion: string | null;
  lineas: { cantidad: number; nombre: string; descripcion: string | null; ingredientes: string[] }[];
};

const PEDIDO_COLS = `pedidoId, pedidoMesa, pedidoClienteNombre, pedidoTotal, pedidoEstado, pedidoCreadoEn, pedidoMetodoPago, pedidoPagadoEn, pedidoObservacion,
  detallesPedido ( detallePedidoCantidad, detallePedidoPrecioUnitario, detallePedidoPlatilloNombre )`;

const COMANDA_DETALLE_COLS = 'detallePedidoCantidad, detallePedidoPlatilloNombre, detallePedidoPlatilloDescripcion, platillos ( recetas ( ingredientes ( ingredienteNombre ) ) )';

const CATEGORIA_ICONOS: Record<string, string> = {
  'Desayunos':         '☕',
  'Sánduches':         '🥪',
  'Platos a la Carta': '🍽',
  'Parrilladas':       '🔥',
  'Fast Food':         '🍔',
  'Bebidas':           '🥤',
  'Entradas':          '🥗',
  'Sopas':             '🍲',
  'Postres':           '🍮',
  'Mariscos':          '🦐',
};

function isHibrido(item: MenuItemUI): item is PlatilloAgrupadoUI {
  return 'esHibrido' in item;
}

function agruparPlatillos(platillos: Platillo[]): MenuItemUI[] {
  const menestras    = platillos.filter(p => p.platilloNombre.startsWith('Menestra con'));
  const parrilladas  = platillos.filter(p => p.platilloNombre.startsWith('Parrillada Ferroviaria'));
  const individuales = platillos.filter(
    p => !p.platilloNombre.startsWith('Menestra con') && !p.platilloNombre.startsWith('Parrillada Ferroviaria')
  );
  const grupos: PlatilloAgrupadoUI[] = [];
  if (menestras.length > 0) {
    grupos.push({
      nombreBase: 'Menestra del Día',
      descripcion: menestras[0].platilloDescripcion,
      precio: 7.00,
      categoria: menestras[0].platilloCategoria,
      esHibrido: true,
      variaciones: menestras.map(p => ({ carne: p.platilloNombre.replace('Menestra con ', ''), platilloId: p.platilloId })),
    });
  }
  if (parrilladas.length > 0) {
    grupos.push({
      nombreBase: 'Parrillada Ferroviaria',
      descripcion: parrilladas[0].platilloDescripcion,
      precio: 8.00,
      categoria: parrilladas[0].platilloCategoria,
      esHibrido: true,
      variaciones: parrilladas.map(p => ({ carne: /\(([^)]+)\)/.exec(p.platilloNombre)?.[1] ?? p.platilloNombre, platilloId: p.platilloId })),
    });
  }
  return [...grupos, ...individuales];
}

function tiempoTranscurrido(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function tiempoTono(iso: string): 'neutro' | 'aviso' | 'peligro' {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins < 15 ? 'neutro' : mins < 30 ? 'aviso' : 'peligro';
}

function fmtHoraGYE(iso: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function MenuMesero({ meseroId }: { meseroId: string }) {
  const [tab, setTab] = useState<'menu' | 'cola' | 'cobrar' | 'historial'>('menu');

  // — Menú —
  const [platillosDB, setPlatillosDB]       = useState<Platillo[]>([]);
  const [carrito, setCarrito]               = useState<LineaCarrito[]>([]);
  const [cargando, setCargando]             = useState(true);
  const [hibridoActivo, setHibridoActivo]   = useState<PlatilloAgrupadoUI | null>(null);
  const [mesa, setMesa]                     = useState('');
  const [clienteNombre, setClienteNombre]   = useState('');
  const [observacion, setObservacion]       = useState('');
  const [guardando, setGuardando]           = useState(false);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [busquedaMenu, setBusquedaMenu]       = useState('');

  // — En cola —
  const [pendientes, setPendientes] = useState<PedidoConDetalle[]>([]);

  // — Por Cobrar —
  const [porCobrar, setPorCobrar]         = useState<PedidoCobro[]>([]);
  const [detallesCobro, setDetallesCobro] = useState<Record<string, DetallePedido[]>>({});
  const [expandidoCobro, setExpandidoCobro] = useState<string | null>(null);
  const [cobrando, setCobrando]           = useState<string | null>(null);
  const cobrarDebounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // — Historial —
  const [historial, setHistorial]   = useState<PedidoConDetalle[]>([]);
  const [fechaDesde, setFechaDesde] = useState(() => fechaHoy());
  const [fechaHasta, setFechaHasta] = useState(() => fechaHoy());
  const [expandido, setExpandido]   = useState<string | null>(null);

  // — Comanda impresión —
  const [comandaPrint, setComandaPrint] = useState<ComandaData | null>(null);
  const [printKey, setPrintKey]         = useState(0);

  useEffect(() => { if (comandaPrint) window.print(); }, [printKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function imprimirComanda(data: ComandaData) {
    setComandaPrint(data);
    setPrintKey(k => k + 1);
  }

  async function cargarPlatillos() {
    const { data } = await supabase
      .from('platillos').select('*')
      .eq('platilloDisponible', true).eq('platilloArchivado', false);
    if (data) setPlatillosDB(data as Platillo[]);
    setCargando(false);
  }

  async function cargarPendientes() {
    const { data } = await supabase
      .from('pedidos').select(PEDIDO_COLS)
      .eq('pedidoMeseroId', meseroId)
      .eq('pedidoEstado', 'pendiente')
      .order('pedidoCreadoEn', { ascending: true });
    if (data) setPendientes(data as PedidoConDetalle[]);
  }

  async function cargarHistorial() {
    const { gte, lte } = rangoUTC(fechaDesde, fechaHasta);
    const { data } = await supabase
      .from('pedidos').select(PEDIDO_COLS)
      .eq('pedidoMeseroId', meseroId)
      .in('pedidoEstado', ['entregado', 'cancelado'])
      .gte('pedidoCreadoEn', gte)
      .lte('pedidoCreadoEn', lte)
      .order('pedidoCreadoEn', { ascending: false });
    if (data) setHistorial(data as PedidoConDetalle[]);
  }

  async function cargarPorCobrar() {
    const { data, error } = await supabase
      .from('vistaPendientesCobro')
      .select('pedidoId, pedidoEntregadoEn, pendienteTotal, pedidoMesa, pedidoMeseroNombre, pedidoClienteNombre')
      .order('pedidoEntregadoEn', { ascending: true });
    console.log('[porCobrar lista]', { data, error });
    if (!data?.length) { setPorCobrar([]); setDetallesCobro({}); return; }

    setPorCobrar(data as PedidoCobro[]);

    const ids = data.map(r => r.pedidoId as string);
    const { data: det, error: detErr } = await supabase
      .from('detallesPedido')
      .select('detallePedidoPedidoId, detallePedidoCantidad, detallePedidoPrecioUnitario, detallePedidoPlatilloNombre')
      .in('detallePedidoPedidoId', ids);
    console.log('[porCobrar detalles]', { det, detErr, ids });

    const mapa: Record<string, DetallePedido[]> = Object.fromEntries(ids.map(id => [id, []]));
    for (const d of (det ?? [])) {
      const id = (d as DetallePedido & { detallePedidoPedidoId: string }).detallePedidoPedidoId;
      if (id in mapa) mapa[id].push(d as DetallePedido);
    }
    setDetallesCobro(mapa);
  }

  function expandirCobro(pedidoId: string) {
    setExpandidoCobro(prev => prev === pedidoId ? null : pedidoId);
  }

  useEffect(() => {
    void cargarPlatillos();
    void cargarPendientes();
    void cargarHistorial();
    void cargarPorCobrar();
  }, []);

  useEffect(() => {
    const canal = supabase
      .channel('platillos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platillos' }, () => { void cargarPlatillos(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, []);

  useEffect(() => {
    const canal = supabase
      .channel('pedidos-mesero-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `pedidoMeseroId=eq.${meseroId}` }, () => {
        void cargarPendientes();
        void cargarHistorial();
        if (cobrarDebounceRef.current) clearTimeout(cobrarDebounceRef.current);
        cobrarDebounceRef.current = setTimeout(() => { void cargarPorCobrar(); }, 800);
      })
      .subscribe();
    return () => {
      if (cobrarDebounceRef.current) clearTimeout(cobrarDebounceRef.current);
      void supabase.removeChannel(canal);
    };
  }, [meseroId]);

  useEffect(() => {
    const canal = supabase
      .channel('pedidos-cobro-global')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, () => {
        if (cobrarDebounceRef.current) clearTimeout(cobrarDebounceRef.current);
        cobrarDebounceRef.current = setTimeout(() => { void cargarPorCobrar(); }, 800);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, []);

  useEffect(() => { void cargarHistorial(); }, [fechaDesde, fechaHasta]);

  const menuUI     = agruparPlatillos(platillosDB);
  const total      = carrito.reduce((s, l) => s + l.platilloPrecio * l.cantidad, 0);
  const totalItems = carrito.reduce((s, l) => s + l.cantidad, 0);

  const conteoPorCat: Record<string, number> = {};
  for (const item of menuUI) {
    const cat = isHibrido(item) ? item.categoria : item.platilloCategoria;
    conteoPorCat[cat] = (conteoPorCat[cat] ?? 0) + 1;
  }
  const categoriasOrdenadas = Object.keys(conteoPorCat).sort();

  const qMenu = busquedaMenu.toLowerCase();
  const resultadosBusqueda = qMenu
    ? menuUI.filter(item =>
        isHibrido(item)
          ? item.nombreBase.toLowerCase().includes(qMenu)
          : item.platilloNombre.toLowerCase().includes(qMenu)
      )
    : [];

  const menuDeCat = categoriaActiva
    ? agruparPlatillos(platillosDB.filter(p => p.platilloCategoria === categoriaActiva))
    : [];

  function agregarPlatillo(p: Platillo) {
    setCarrito(prev => {
      const idx = prev.findIndex(l => l.platilloId === p.platilloId);
      if (idx !== -1) return prev.map((l, i) => i === idx ? { ...l, cantidad: l.cantidad + 1 } : l);
      return [...prev, { platilloId: p.platilloId, platilloNombre: p.platilloNombre, platilloPrecio: p.platilloPrecio, cantidad: 1 }];
    });
  }

  function confirmarCarne(variacion: { carne: string; platilloId: string }, agrupado: PlatilloAgrupadoUI) {
    const nombre = `${agrupado.nombreBase} (${variacion.carne})`;
    setCarrito(prev => {
      const idx = prev.findIndex(l => l.platilloId === variacion.platilloId);
      if (idx !== -1) return prev.map((l, i) => i === idx ? { ...l, cantidad: l.cantidad + 1 } : l);
      return [...prev, { platilloId: variacion.platilloId, platilloNombre: nombre, platilloPrecio: agrupado.precio, cantidad: 1, variacionCarne: variacion.carne }];
    });
    setHibridoActivo(null);
  }

  function actualizarCantidad(platilloId: string, delta: number) {
    setCarrito(prev =>
      prev.flatMap(l => {
        if (l.platilloId !== platilloId) return [l];
        const nueva = l.cantidad + delta;
        return nueva > 0 ? [{ ...l, cantidad: nueva }] : [];
      })
    );
  }

  async function handleConfirmar() {
    if (!mesa.trim()) { alert('Ingresa el número o nombre de la mesa.'); return; }
    setGuardando(true);
    try {
      const mesaActual        = mesa.trim();
      const observacionActual = observacion.trim() || null;
      const { pedidoId }      = await confirmarPedido(carrito, {
        mesa: mesaActual,
        clienteNombre: clienteNombre.trim() || undefined,
        observacion: observacionActual,
        meseroId,
      });
      setCarrito([]);
      setMesa('');
      setClienteNombre('');
      setObservacion('');
      setCarritoAbierto(false);
      void cargarPendientes();
      const { data: det } = await supabase
        .from('detallesPedido')
        .select(COMANDA_DETALLE_COLS)
        .eq('detallePedidoPedidoId', pedidoId);
      imprimirComanda({
        pedidoId,
        mesa: mesaActual,
        hora: new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' }).format(new Date()),
        observacion: observacionActual,
        lineas: ((det ?? []) as DetComanda[]).map(d => ({
          cantidad: d.detallePedidoCantidad,
          nombre: d.detallePedidoPlatilloNombre ?? '(sin nombre)',
          descripcion: d.detallePedidoPlatilloDescripcion ?? null,
          ingredientes: (d.platillos?.[0]?.recetas ?? []).flatMap(r => r.ingredientes.map(i => i.ingredienteNombre)),
        })),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar la comanda.');
    } finally {
      setGuardando(false);
    }
  }

  async function marcarEntregado(pedidoId: string) {
    await supabase.from('pedidos').update({ pedidoEstado: 'entregado' }).eq('pedidoId', pedidoId);
    void cargarPendientes();
    void cargarHistorial();
  }

  async function cancelarPedido(pedidoId: string) {
    if (!confirm('¿Cancelar este pedido?')) return;
    await supabase.from('pedidos').update({ pedidoEstado: 'cancelado' }).eq('pedidoId', pedidoId);
    void cargarPendientes();
    void cargarHistorial();
  }

  async function reimprimir(p: PedidoConDetalle) {
    const { data: det } = await supabase
      .from('detallesPedido')
      .select(COMANDA_DETALLE_COLS)
      .eq('detallePedidoPedidoId', p.pedidoId);
    imprimirComanda({
      pedidoId: p.pedidoId,
      mesa: p.pedidoMesa ?? '—',
      hora: new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' }).format(new Date(p.pedidoCreadoEn)),
      observacion: p.pedidoObservacion,
      lineas: ((det ?? []) as DetComanda[]).map(d => ({
        cantidad: d.detallePedidoCantidad,
        nombre: d.detallePedidoPlatilloNombre ?? '(sin nombre)',
        descripcion: d.detallePedidoPlatilloDescripcion ?? null,
        ingredientes: (d.platillos?.[0]?.recetas ?? []).flatMap(r => (r.ingredientes ?? []).map(i => i.ingredienteNombre)),
      })),
    });
  }

  async function cobrarPedido(pedidoId: string, metodo: 'efectivo' | 'transferencia') {
    if (!confirm(`¿Registrar cobro con ${metodo}? Esta acción no se puede deshacer.`)) return;
    setCobrando(pedidoId);
    const { error } = await supabase
      .from('pedidos')
      .update({ pedidoMetodoPago: metodo })
      .eq('pedidoId', pedidoId);
    setCobrando(null);
    if (error) {
      setPorCobrar(prev => prev.filter(p => p.pedidoId !== pedidoId));
      setDetallesCobro(prev => { const n = { ...prev }; delete n[pedidoId]; return n; });
      void cargarPorCobrar();
      alert('Este pedido ya fue cobrado por otra persona.');
      return;
    }
    setPorCobrar(prev => prev.filter(p => p.pedidoId !== pedidoId));
    setDetallesCobro(prev => { const n = { ...prev }; delete n[pedidoId]; return n; });
    void cargarHistorial();
  }

  // ── Tarjeta de platillo (mesero) ─────────────────────────────────────────────
  function renderItem(item: MenuItemUI) {
    if (isHibrido(item)) return (
      <div key={item.nombreBase} className="bg-tarjeta rounded-xl border border-linea flex flex-col overflow-hidden">
        <div className="p-4 flex-1">
          <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">{item.categoria}</p>
          <h3 className="text-[15px] font-medium text-tinta mt-1 leading-snug">{item.nombreBase}</h3>
          {item.descripcion && (
            <p className="text-xs text-tinta-media mt-1 leading-relaxed line-clamp-2">{item.descripcion}</p>
          )}
        </div>
        <div className="px-4 pb-4 border-t border-linea-suave pt-3 flex items-center justify-between">
          <span className="text-base font-medium text-oro-tinta">${item.precio.toFixed(2)}</span>
          <button
            onClick={() => setHibridoActivo(item)}
            className="border border-linea text-tinta font-medium text-sm px-4 min-h-[44px] rounded-lg hover:bg-linea-suave transition-colors duration-200"
          >
            Elegir carne
          </button>
        </div>
      </div>
    );
    return (
      <div key={item.platilloId} className="bg-tarjeta rounded-xl border border-linea flex flex-col overflow-hidden">
        <div className="p-4 flex-1">
          <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">{item.platilloCategoria}</p>
          <h3 className="text-[15px] font-medium text-tinta mt-1 leading-snug">{item.platilloNombre}</h3>
          {item.platilloDescripcion && (
            <p className="text-xs text-tinta-media mt-1 leading-relaxed line-clamp-2">{item.platilloDescripcion}</p>
          )}
        </div>
        <div className="px-4 pb-4 border-t border-linea-suave pt-3 flex items-center justify-between">
          <span className="text-base font-medium text-oro-tinta">${item.platilloPrecio.toFixed(2)}</span>
          <button
            onClick={() => agregarPlatillo(item)}
            className="border border-linea text-tinta font-medium text-sm px-4 min-h-[44px] rounded-lg hover:bg-linea-suave transition-colors duration-200"
          >
            + Añadir
          </button>
        </div>
      </div>
    );
  }

  // ── Carrito (compartido entre sidebar y bottom sheet) ───────────────────────
  const carritoLineas = (
    <div className="flex-1 overflow-y-auto p-5 space-y-1">
      {carrito.length === 0 ? (
        <EstadoVacio icono="🛒" titulo="Tu pedido está vacío" descripcion="Elige una categoría para empezar." />
      ) : carrito.map(linea => (
        <div key={linea.platilloId} className="flex items-start gap-3 py-3 border-b border-linea-suave last:border-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => actualizarCantidad(linea.platilloId, -1)}
              className="w-[44px] h-[44px] rounded-full border border-linea hover:border-oro/50 hover:bg-oro-tinte text-tinta text-base flex items-center justify-center transition-colors duration-200"
            >−</button>
            <span className="w-6 text-center text-sm font-medium text-tinta">{linea.cantidad}</span>
            <button
              onClick={() => actualizarCantidad(linea.platilloId, 1)}
              className="w-[44px] h-[44px] rounded-full bg-oro hover:opacity-90 text-carbon text-base flex items-center justify-center transition-colors duration-200"
            >+</button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-tinta leading-tight">{linea.platilloNombre}</p>
            <p className="text-xs text-tinta-suave mt-0.5">${linea.platilloPrecio.toFixed(2)} c/u</p>
          </div>
          <span className="text-sm font-medium text-oro-tinta whitespace-nowrap">${(linea.platilloPrecio * linea.cantidad).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );

  const carritoFooter = carrito.length > 0 ? (
    <div className="p-5 border-t border-linea space-y-3 bg-linea-suave/30 shrink-0">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase tracking-widest text-tinta-suave">Total</span>
        <span className="text-2xl font-medium text-oro-tinta tracking-tight">${total.toFixed(2)}</span>
      </div>
      <input
        type="text"
        value={mesa}
        onChange={e => setMesa(e.target.value)}
        placeholder="Mesa *"
        className="w-full h-[44px] px-4 rounded-xl border border-linea focus:outline-none focus:ring-1 focus:ring-oro font-medium text-sm"
      />
      <input
        type="text"
        value={clienteNombre}
        onChange={e => setClienteNombre(e.target.value)}
        placeholder="Nombre del cliente (opcional)"
        className="w-full h-[44px] px-4 rounded-xl border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
      />
      <textarea
        value={observacion}
        onChange={e => setObservacion(e.target.value)}
        placeholder="Observación — ej. Sin ensalada, Bien cocido"
        rows={2}
        className="w-full px-4 py-2.5 rounded-xl border border-linea focus:outline-none focus:ring-1 focus:ring-oro resize-none min-h-[52px] text-sm"
      />
      <Boton variante="primario" className="w-full" onClick={handleConfirmar} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Confirmar pedido'}
      </Boton>
    </div>
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ══ Pestañas — desktop ══ */}
      <nav className="hidden md:flex bg-tarjeta border-b border-linea items-center overflow-x-auto">
        {(['menu', 'cola', 'cobrar', 'historial'] as const).map(t => {
          const labels = { menu: 'Menú', cola: 'En cola', cobrar: 'Por Cobrar', historial: 'Historial' };
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-5 min-h-[44px] text-sm font-medium whitespace-nowrap transition-colors duration-200 border-b-2 -mb-px ${
                active ? 'border-oro text-tinta' : 'border-transparent text-tinta-media hover:text-tinta'
              }`}
            >
              {labels[t]}
              {t === 'cola' && pendientes.length > 0 && (
                <Insignia tono="oro" className="ml-1.5">{pendientes.length > 9 ? '9+' : pendientes.length}</Insignia>
              )}
              {t === 'cobrar' && porCobrar.length > 0 && (
                <Insignia tono="oro" className="ml-1.5">{porCobrar.length > 9 ? '9+' : porCobrar.length}</Insignia>
              )}
            </button>
          );
        })}
      </nav>

      {/* ══ Menú ══ */}
      {tab === 'menu' && (
        <div className="flex flex-col md:flex-row md:min-h-screen bg-lienzo">

          {/* Columna izquierda */}
          <div className="flex-1 overflow-y-auto">

            {/* Cabecera sticky: categoría (nivel 2) o buscador (nivel 1 / búsqueda) */}
            <div className="sticky top-0 z-10 bg-tarjeta border-b border-linea shadow-sm">
              {categoriaActiva && !busquedaMenu ? (
                <div className="px-4 pt-3 pb-3 space-y-2">
                  <Boton variante="secundario" onClick={() => setCategoriaActiva(null)}>
                    ← Categorías
                  </Boton>
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="text-[20px] font-medium text-tinta leading-tight">{categoriaActiva}</h1>
                    <span className="text-[11px] text-tinta-suave whitespace-nowrap shrink-0">{menuDeCat.length} platillo(s)</span>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={busquedaMenu}
                      onChange={e => setBusquedaMenu(e.target.value)}
                      placeholder="Buscar platillo…"
                      className="w-full pl-4 pr-9 py-2.5 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro bg-lienzo text-sm"
                    />
                    <span className="absolute right-3 top-3 text-tinta-suave text-sm pointer-events-none">🔍</span>
                    {busquedaMenu && (
                      <button
                        onClick={() => setBusquedaMenu('')}
                        className="absolute right-8 top-2.5 text-tinta-suave hover:text-tinta leading-none text-sm px-0.5"
                        aria-label="Limpiar búsqueda"
                      >✕</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cargando */}
            {cargando ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-tinta-media text-sm">Cargando menú…</p>
              </div>

            /* Búsqueda */
            ) : busquedaMenu ? (
              resultadosBusqueda.length === 0 ? (
                <div className="p-6">
                  <EstadoVacio icono="🔍" titulo={`Sin resultados para "${busquedaMenu}"`} descripcion="Prueba con otra palabra." />
                </div>
              ) : (
                <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-36 md:pb-6">
                  {resultadosBusqueda.map(item => renderItem(item))}
                </div>
              )

            /* Nivel 1 — Mosaico de categorías */
            ) : categoriaActiva === null ? (
              <div className="p-4 sm:p-6 pb-20 md:pb-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoriasOrdenadas.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoriaActiva(cat)}
                    className="bg-tarjeta rounded-2xl border border-linea border-t-[3px] border-t-oro hover:shadow-md active:scale-[0.97] transition-all duration-200 p-6 flex flex-col min-h-[140px] text-left"
                  >
                    <span className="text-2xl">{CATEGORIA_ICONOS[cat] ?? '🍽'}</span>
                    <h3 className="text-base font-medium text-tinta leading-snug mt-3">{cat}</h3>
                    <p className="mt-1.5 text-[11px] uppercase tracking-[0.12em] text-tinta-suave">
                      {conteoPorCat[cat]} platillo(s)
                    </p>
                  </button>
                ))}
              </div>

            /* Nivel 2 — Platillos de la categoría */
            ) : (
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-36 md:pb-6">
                {menuDeCat.map(item => renderItem(item))}
              </div>
            )}
          </div>

          {/* Carrito — sidebar escritorio */}
          <aside className="hidden md:flex md:w-80 lg:w-96 flex-col md:sticky md:top-0 md:h-screen border-l border-linea bg-tarjeta">
            <div className="bg-carbon px-5 py-4">
              <h2 className="text-base font-medium text-white tracking-tight">Pedido Actual</h2>
              <p className="text-white/40 text-xs mt-0.5">
                {carrito.length === 0 ? 'Sin artículos' : `${totalItems} artículo(s)`}
              </p>
            </div>
            <div className="h-[2px] bg-oro" />
            {carritoLineas}
            {carritoFooter}
          </aside>

          {/* FAB móvil */}
          {carrito.length > 0 && (
            <button
              onClick={() => setCarritoAbierto(true)}
              className="fixed bottom-[76px] right-4 z-40 md:hidden bg-oro text-carbon font-medium rounded-full shadow-xl flex items-center gap-2 px-5 min-h-[56px]"
            >
              🛒 <span>{totalItems}</span>
              <span className="text-carbon/40">·</span>
              <span>${total.toFixed(2)}</span>
            </button>
          )}

          {/* Bottom sheet móvil */}
          {carritoAbierto && (
            <div
              className="fixed inset-0 z-50 md:hidden flex flex-col justify-end"
              onClick={() => setCarritoAbierto(false)}
            >
              <div className="absolute inset-0 bg-carbon/40" />
              <div
                className="relative bg-tarjeta rounded-t-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '85svh' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="bg-carbon px-5 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-base font-medium text-white tracking-tight">Pedido Actual</h2>
                    <p className="text-white/40 text-xs mt-0.5">
                      {carrito.length === 0 ? 'Sin artículos' : `${totalItems} artículo(s)`}
                    </p>
                  </div>
                  <button
                    onClick={() => setCarritoAbierto(false)}
                    className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white shrink-0 transition-colors"
                    aria-label="Cerrar carrito"
                  >✕</button>
                </div>
                <div className="h-[2px] bg-oro shrink-0" />
                {carritoLineas}
                {carritoFooter}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ En Cola ══ */}
      {tab === 'cola' && (
        <div className="p-4 sm:p-6 pb-20 md:pb-6 bg-lienzo min-h-screen">
          {pendientes.length === 0 ? (
            <EstadoVacio icono="🔔" titulo="No hay pedidos pendientes" descripcion="Los pedidos confirmados aparecen aquí en tiempo real." />
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {pendientes.map(p => (
                <Tarjeta key={p.pedidoId} acento>
                  {/* Cabecera */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-[15px] font-medium text-tinta">{p.pedidoMesa ?? '—'}</p>
                      {p.pedidoClienteNombre && (
                        <p className="text-xs text-tinta-suave mt-0.5">{p.pedidoClienteNombre}</p>
                      )}
                    </div>
                    <Insignia tono={tiempoTono(p.pedidoCreadoEn)} className="shrink-0">
                      {tiempoTranscurrido(p.pedidoCreadoEn)}
                    </Insignia>
                  </div>

                  {/* Ítems */}
                  <ul className="space-y-1.5 mb-3 border-t border-linea-suave pt-3">
                    {p.detallesPedido.map((d, i) => (
                      <li key={i}>
                        <div className="flex justify-between">
                          <span className="text-sm text-tinta">{d.detallePedidoCantidad}× {d.detallePedidoPlatilloNombre ?? '(sin nombre)'}</span>
                          <span className="text-sm text-tinta-media ml-4">${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}</span>
                        </div>
                        {d.detallePedidoPlatilloDescripcion && (
                          <p className="text-[11px] text-tinta-suave mt-0.5 pl-4">{d.detallePedidoPlatilloDescripcion}</p>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Observación */}
                  {p.pedidoObservacion && (
                    <div className="bg-oro-tinte border border-linea border-l-[3px] border-l-oro px-3 py-2 mb-3">
                      <p className="text-sm text-tinta">{p.pedidoObservacion}</p>
                    </div>
                  )}

                  {/* Total */}
                  <div className="border-t border-linea-suave pt-3 mb-4 flex justify-end">
                    <span className="text-base font-medium text-tinta">${p.pedidoTotal.toFixed(2)}</span>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2">
                    <Boton variante="primario" className="flex-1" onClick={() => marcarEntregado(p.pedidoId)}>
                      Marcar entregado
                    </Boton>
                    <Boton variante="icono" aria-label="Reimprimir comanda" onClick={() => void reimprimir(p)}>
                      🖨
                    </Boton>
                    <Boton variante="peligro" onClick={() => cancelarPedido(p.pedidoId)}>
                      Cancelar
                    </Boton>
                  </div>
                </Tarjeta>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Por Cobrar ══ */}
      {tab === 'cobrar' && (
        <div className="p-4 sm:p-6 pb-20 md:pb-6 bg-lienzo min-h-screen space-y-4">

          {/* Franja de resumen */}
          {porCobrar.length > 0 && (
            <Tarjeta className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-0.5">Pedidos por cobrar</p>
                <p className="text-2xl font-medium text-tinta">{porCobrar.length}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-0.5">Total pendiente</p>
                <p className="text-2xl font-medium text-oro-tinta">
                  ${porCobrar.reduce((s, p) => s + Number(p.pendienteTotal), 0).toFixed(2)}
                </p>
              </div>
            </Tarjeta>
          )}

          {porCobrar.length === 0 ? (
            <EstadoVacio icono="💳" titulo="Sin pedidos por cobrar" descripcion="Los pedidos entregados aparecen aquí hasta registrar el pago." />
          ) : (
            <div className="space-y-4">
              {porCobrar.map(p => {
                const abierto      = expandidoCobro === p.pedidoId;
                const cargandoEste = cobrando === p.pedidoId;
                const lineas       = detallesCobro[p.pedidoId];
                return (
                  <Tarjeta key={p.pedidoId}>
                    {/* Cabecera */}
                    <button
                      className="w-full text-left flex items-start justify-between gap-3 mb-3"
                      onClick={() => expandirCobro(p.pedidoId)}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium text-oro-tinta">#{p.pedidoId.slice(0, 8)}</span>
                          <Insignia tono="exito">Entregado</Insignia>
                        </div>
                        {p.pedidoMesa && (
                          <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">Mesa: {p.pedidoMesa}</p>
                        )}
                        {p.pedidoMeseroNombre && (
                          <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">Mesero: {p.pedidoMeseroNombre}</p>
                        )}
                        {p.pedidoClienteNombre && (
                          <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">Cliente: {p.pedidoClienteNombre}</p>
                        )}
                        <p className="text-[11px] uppercase tracking-[0.1em] text-tinta-suave">
                          Entregado {fmtHoraGYE(p.pedidoEntregadoEn)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[18px] font-medium text-tinta">${Number(p.pendienteTotal).toFixed(2)}</p>
                        <span className="text-tinta-suave text-xs">{abierto ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Desglose */}
                    {abierto && (
                      <div className="border-t border-linea-suave pt-3 mb-3">
                        {lineas === undefined ? (
                          <p className="text-xs text-tinta-suave py-2">Cargando desglose…</p>
                        ) : lineas.length === 0 ? (
                          <p className="text-xs text-tinta-suave py-2">Sin líneas registradas.</p>
                        ) : (
                          <ul className="space-y-1">
                            {lineas.map((d, i) => (
                              <li key={i} className="flex justify-between text-sm">
                                <span className="text-tinta">{d.detallePedidoCantidad}× {d.detallePedidoPlatilloNombre ?? '(sin nombre)'}</span>
                                <span className="text-tinta-media ml-4">${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Cobro */}
                    <div className="grid grid-cols-2 gap-3 border-t border-linea-suave pt-3">
                      <Boton variante="primario" onClick={() => cobrarPedido(p.pedidoId, 'efectivo')} disabled={cargandoEste}>
                        Efectivo
                      </Boton>
                      <Boton variante="secundario" onClick={() => cobrarPedido(p.pedidoId, 'transferencia')} disabled={cargandoEste}>
                        Transferencia
                      </Boton>
                    </div>
                  </Tarjeta>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Historial ══ */}
      {tab === 'historial' && (
        <div className="p-4 sm:p-6 pb-20 md:pb-6 bg-lienzo min-h-screen space-y-4">

          {/* Filtros */}
          <Tarjeta className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-widest text-tinta-suave shrink-0">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="flex-1 sm:flex-none h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-widest text-tinta-suave shrink-0">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="flex-1 sm:flex-none h-[44px] px-3 rounded-lg border border-linea focus:outline-none focus:ring-1 focus:ring-oro text-sm"
              />
            </div>
          </Tarjeta>

          {historial.length === 0 ? (
            <EstadoVacio icono="📋" titulo="Sin pedidos en este rango de fechas" descripcion="Prueba ampliando el rango de fechas." />
          ) : (
            <Tarjeta sinPadding className="overflow-hidden">
              {historial.map((p, idx) => {
                const abierto     = expandido === p.pedidoId;
                const esEntregado = p.pedidoEstado === 'entregado';
                return (
                  <div key={p.pedidoId} className={idx > 0 ? 'border-t border-linea-suave' : ''}>
                    <button
                      className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[56px]"
                      onClick={() => setExpandido(abierto ? null : p.pedidoId)}
                    >
                      <span className="text-xs text-tinta-suave w-14 shrink-0">
                        {new Date(p.pedidoCreadoEn).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-sm font-medium text-tinta w-20 shrink-0 truncate">
                        {p.pedidoMesa ?? '—'}
                      </span>
                      <span className="flex-1 text-xs text-tinta-suave truncate">{p.pedidoClienteNombre ?? ''}</span>
                      <Insignia tono={esEntregado ? 'exito' : 'neutro'} className="shrink-0">
                        {esEntregado ? 'Entregado' : 'Cancelado'}
                      </Insignia>
                      <span className="shrink-0 text-sm font-medium text-tinta ml-2">${p.pedidoTotal.toFixed(2)}</span>
                      <span className="shrink-0 text-tinta-suave ml-1 text-xs">{abierto ? '▲' : '▼'}</span>
                    </button>

                    {abierto && (
                      <div className="px-4 pb-3 border-t border-linea-suave bg-linea-suave/20">
                        <ul className="space-y-1 py-3">
                          {p.detallesPedido.map((d, i) => (
                            <li key={i} className="flex justify-between text-sm">
                              <span className="text-tinta">{d.detallePedidoCantidad}× {d.detallePedidoPlatilloNombre ?? '(sin nombre)'}</span>
                              <span className="text-tinta-media ml-4">${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                        {p.pedidoMetodoPago && (
                          <div className="flex items-center gap-2 pt-2 border-t border-linea-suave">
                            <Insignia tono="neutro">{p.pedidoMetodoPago}</Insignia>
                            {p.pedidoPagadoEn && (
                              <span className="text-[11px] text-tinta-suave">Cobrado {fmtHoraGYE(p.pedidoPagadoEn)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Tarjeta>
          )}
        </div>
      )}

      {/* ══ Modal — Selección de carne ══ */}
      {hibridoActivo && (
        <div
          className="fixed inset-0 bg-carbon/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setHibridoActivo(null)}
        >
          <div className="bg-tarjeta rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-carbon px-6 py-4">
              <h3 className="text-base font-medium text-white tracking-tight">{hibridoActivo.nombreBase}</h3>
              <p className="text-white/50 text-sm mt-0.5">${hibridoActivo.precio.toFixed(2)}</p>
            </div>
            <div className="h-[2px] bg-oro" />
            <div className="p-5 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-tinta-suave mb-3">Elige tu corte</p>
              {hibridoActivo.variaciones.map(v => (
                <button
                  key={v.platilloId}
                  onClick={() => confirmarCarne(v, hibridoActivo)}
                  className="w-full text-left border border-linea hover:border-oro/50 hover:bg-oro-tinte rounded-xl px-4 min-h-[44px] flex items-center justify-between text-sm font-medium text-tinta transition-colors duration-200"
                >
                  <span>{v.carne}</span>
                  <span className="text-oro-tinta">${hibridoActivo.precio.toFixed(2)}</span>
                </button>
              ))}
              <button onClick={() => setHibridoActivo(null)} className="w-full text-center text-sm text-tinta-suave hover:text-tinta-media transition-colors duration-200 py-2 mt-2">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Comanda de cocina — portal directo a body; #root se oculta en print ══ */}
      {createPortal(
        <div id="comanda-print" aria-hidden={!comandaPrint}>
        {comandaPrint && (
          <div style={{ fontFamily: "'Courier New', Courier, monospace", width: '72mm', padding: '3mm 3mm 6mm', color: '#000', background: '#fff' }}>
            <p style={{ fontSize: '12pt', fontWeight: 900, textAlign: 'center', letterSpacing: '0.1em', margin: '0 0 2mm' }}>
              COMANDA COCINA
            </p>
            <p style={{ fontSize: '26pt', fontWeight: 900, textAlign: 'center', lineHeight: 1.1, margin: '0 0 2mm' }}>
              Mesa {comandaPrint.mesa}
            </p>
            <p style={{ fontSize: '9pt', textAlign: 'center', margin: '0 0 3mm', color: '#555' }}>
              {comandaPrint.hora} — #{comandaPrint.pedidoId.slice(0, 8)}
            </p>
            <div style={{ borderTop: '2px solid #000', margin: '0 0 3mm' }} />
            {comandaPrint.lineas.map((l, i) => (
              <div key={i} style={{ marginBottom: '3mm' }}>
                <p style={{ fontSize: '14pt', fontWeight: 700, margin: '0 0 1mm', lineHeight: 1.3 }}>
                  {l.cantidad}×&nbsp;{l.nombre}
                </p>
                {l.descripcion && (
                  <p style={{ fontSize: '9pt', fontWeight: 400, margin: '0 0 1mm', paddingLeft: '4mm', lineHeight: 1.4, color: '#333' }}>
                    {l.descripcion}
                  </p>
                )}
                {l.ingredientes.length > 0 && (
                  <div style={{ paddingLeft: '4mm' }}>
                    {l.ingredientes.map((ing, j) => (
                      <p key={j} style={{ fontSize: '10pt', fontWeight: 400, margin: '0', lineHeight: 1.5 }}>- {ing}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {comandaPrint.observacion && (
              <>
                <div style={{ borderTop: '2px solid #000', margin: '3mm 0 2mm' }} />
                <p style={{ fontSize: '12pt', fontWeight: 900, textAlign: 'center', margin: '0 0 1mm' }}>** OBSERVACIÓN **</p>
                <p style={{ fontSize: '13pt', fontWeight: 700, textAlign: 'center', margin: '0 0 2mm', whiteSpace: 'pre-wrap' }}>{comandaPrint.observacion}</p>
                <div style={{ borderTop: '2px solid #000', marginBottom: '2mm' }} />
              </>
            )}
            <div style={{ borderTop: '1px dashed #000', marginTop: '4mm' }} />
          </div>
        )}
      </div>,
        document.body
      )}

      {/* ══ Barra de navegación inferior — solo móvil ══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-tarjeta border-t border-linea flex">
        {(['menu', 'cola', 'cobrar', 'historial'] as const).map(id => {
          const ICONS  = { menu: '🍽', cola: '🔔', cobrar: '💳', historial: '📋' };
          const LABELS = { menu: 'Menú', cola: 'En Cola', cobrar: 'Cobrar', historial: 'Historial' };
          const BADGES: Record<string, number> = { menu: 0, cola: pendientes.length, cobrar: porCobrar.length, historial: 0 };
          const badge  = BADGES[id];
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] relative transition-colors duration-200 ${active ? 'text-oro-tinta' : 'text-tinta-suave'}`}
            >
              <span className="text-xl leading-none relative">
                {ICONS[id]}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-oro text-carbon">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] mt-1 font-medium">{LABELS[id]}</span>
              {active && <span className="absolute bottom-0 inset-x-0 h-[2px] bg-oro" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
