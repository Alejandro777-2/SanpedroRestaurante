import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { type Platillo, type LineaCarrito, type PlatilloAgrupadoUI } from '../types';
import { confirmarPedido } from '../lib/confirmarPedido';
import { fechaHoy, rangoUTC } from '../lib/exportar';

type MenuItemUI = Platillo | PlatilloAgrupadoUI;

type DetallePedido = {
  detallePedidoCantidad: number;
  detallePedidoPrecioUnitario: number;
  platillos: { platilloNombre: string }[];
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

const PEDIDO_COLS = `pedidoId, pedidoMesa, pedidoClienteNombre, pedidoTotal, pedidoEstado, pedidoCreadoEn, pedidoMetodoPago, pedidoPagadoEn,
  detallesPedido ( detallePedidoCantidad, detallePedidoPrecioUnitario, platillos ( platilloNombre ) )`;

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
  const [guardando, setGuardando]           = useState(false);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [busquedaMenu, setBusquedaMenu]       = useState('');

  // — En cola —
  const [pendientes, setPendientes] = useState<PedidoConDetalle[]>([]);

  // — Por Cobrar —
  const [porCobrar, setPorCobrar]             = useState<PedidoCobro[]>([]);
  const [detallesCobro, setDetallesCobro]     = useState<Record<string, DetallePedido[]>>({});
  const [expandidoCobro, setExpandidoCobro] = useState<string | null>(null);
  const [cobrando, setCobrando]             = useState<string | null>(null);
  const cobrarDebounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // — Historial —
  const [historial, setHistorial]   = useState<PedidoConDetalle[]>([]);
  const [fechaDesde, setFechaDesde] = useState(() => fechaHoy());
  const [fechaHasta, setFechaHasta] = useState(() => fechaHoy());
  const [expandido, setExpandido]   = useState<string | null>(null);

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

    // Batch-fetch all detalles upfront (same pattern as "En Cola")
    const ids = data.map(r => r.pedidoId as string);
    const { data: det, error: detErr } = await supabase
      .from('detallesPedido')
      .select('detallePedidoPedidoId, detallePedidoCantidad, detallePedidoPrecioUnitario, platillos ( platilloNombre )')
      .in('detallePedidoPedidoId', ids);
    console.log('[porCobrar detalles]', { det, detErr, ids });

    // Pre-initialize every ID so the render never shows "Cargando"
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

  // Recarga Por Cobrar cuando CUALQUIER sesión registra un cobro (pedido de otro mesero)
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
      const { pedidoId } = await confirmarPedido(carrito, {
        mesa: mesa.trim(),
        clienteNombre: clienteNombre.trim() || undefined,
        meseroId,
      });
      setCarrito([]);
      setMesa('');
      setClienteNombre('');
      setCarritoAbierto(false);
      void cargarPendientes();
      alert(`Comanda registrada ✔  (#${pedidoId.slice(0, 8)})`);
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

  async function cobrarPedido(pedidoId: string, metodo: 'efectivo' | 'transferencia') {
    if (!confirm(`¿Registrar cobro con ${metodo}? Esta acción no se puede deshacer.`)) return;
    setCobrando(pedidoId);
    const { error } = await supabase
      .from('pedidos')
      .update({ pedidoMetodoPago: metodo })
      .eq('pedidoId', pedidoId);
    setCobrando(null);
    if (error) {
      // El trigger trg_sellar_pago rechazó el UPDATE: el pedido ya fue cobrado por otra sesión
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

  // ── Tarjeta de platillo ──────────────────────────────────────────────────────
  function renderItem(item: MenuItemUI) {
    if (isHibrido(item)) return (
      <div key={item.nombreBase} className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-[3px] border-t-sanpedro-gold flex flex-col overflow-hidden">
        <div className="p-5 flex-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">{item.categoria}</p>
          <h3 className="text-base font-medium text-sanpedro-dark mt-2 leading-snug">{item.nombreBase}</h3>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">{item.descripcion}</p>
        </div>
        <div className="px-5 pb-5">
          <div className="border-t border-stone-100 pt-4 flex items-center justify-between">
            <span className="text-xl font-medium text-sanpedro-wood tracking-tight">${item.precio.toFixed(2)}</span>
            <button
              onClick={() => setHibridoActivo(item)}
              className="border border-sanpedro-gold/60 text-sanpedro-gold-dark font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-sanpedro-gold/10 transition-colors duration-200 min-h-[44px]"
            >
              Elegir carne
            </button>
          </div>
        </div>
      </div>
    );
    return (
      <div key={item.platilloId} className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-[3px] border-t-sanpedro-gold flex flex-col overflow-hidden">
        <div className="p-5 flex-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">{item.platilloCategoria}</p>
          <h3 className="text-base font-medium text-sanpedro-dark mt-2 leading-snug">{item.platilloNombre}</h3>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">{item.platilloDescripcion}</p>
        </div>
        <div className="px-5 pb-5">
          <div className="border-t border-stone-100 pt-4 flex items-center justify-between">
            <span className="text-xl font-medium text-sanpedro-wood tracking-tight">${item.platilloPrecio.toFixed(2)}</span>
            <button
              onClick={() => agregarPlatillo(item)}
              className="border border-sanpedro-gold/60 text-sanpedro-gold-dark font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-sanpedro-gold/10 transition-colors duration-200 min-h-[44px]"
            >
              + Añadir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Carrito compartido (sidebar escritorio + sheet móvil) ────────────────────
  const carritoLineas = (
    <div className="flex-1 overflow-y-auto p-5 space-y-1">
      {carrito.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <p className="text-sm text-stone-400">Aún no has añadido platillos.</p>
          <p className="text-xs text-stone-300 mt-1">Selecciona del menú para comenzar.</p>
        </div>
      ) : carrito.map(linea => (
        <div key={linea.platilloId} className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => actualizarCantidad(linea.platilloId, -1)}
              className="w-9 h-9 rounded-full border border-stone-200 hover:border-sanpedro-gold/50 hover:bg-sanpedro-gold/10 text-stone-500 text-base flex items-center justify-center transition-colors duration-200"
            >−</button>
            <span className="w-6 text-center text-sm font-medium text-sanpedro-dark">{linea.cantidad}</span>
            <button
              onClick={() => actualizarCantidad(linea.platilloId, 1)}
              className="w-9 h-9 rounded-full bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark text-base flex items-center justify-center transition-colors duration-200"
            >+</button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sanpedro-dark leading-tight">{linea.platilloNombre}</p>
            <p className="text-xs text-stone-400 mt-0.5">${linea.platilloPrecio.toFixed(2)} c/u</p>
          </div>
          <span className="text-sm font-medium text-sanpedro-wood whitespace-nowrap">${(linea.platilloPrecio * linea.cantidad).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );

  const carritoFooter = carrito.length > 0 ? (
    <div className="p-5 border-t border-stone-100 space-y-3 bg-sanpedro-wood-light/20 shrink-0">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Total</span>
        <span className="text-2xl font-medium text-sanpedro-wood tracking-tight">${total.toFixed(2)}</span>
      </div>
      <input
        type="text"
        value={mesa}
        onChange={e => setMesa(e.target.value)}
        placeholder="Mesa *"
        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold/40 focus:border-sanpedro-gold font-medium"
      />
      <input
        type="text"
        value={clienteNombre}
        onChange={e => setClienteNombre(e.target.value)}
        placeholder="Nombre del cliente (opcional)"
        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold/40 focus:border-sanpedro-gold"
      />
      <button
        onClick={handleConfirmar}
        disabled={guardando}
        className="w-full bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-medium py-3 rounded-xl transition-colors duration-200 tracking-wide shadow-sm disabled:opacity-50 min-h-[48px]"
      >
        {guardando ? 'Guardando…' : 'Confirmar Comanda'}
      </button>
    </div>
  ) : null;

  return (
    <div>
      {/* ══ Pestañas ══ */}
      <nav className="bg-white border-b border-stone-200 flex items-center overflow-x-auto">
        {(['menu', 'cola', 'cobrar', 'historial'] as const).map(t => {
          const labels = { menu: 'Menú', cola: 'En cola', cobrar: 'Por Cobrar', historial: 'Historial' };
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 border-b-2 -mb-px ${
                active
                  ? 'border-sanpedro-gold text-sanpedro-wood'
                  : 'border-transparent text-stone-400 hover:text-sanpedro-wood'
              }`}
            >
              {labels[t]}
              {t === 'cola' && pendientes.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sanpedro-gold text-sanpedro-dark text-xs font-medium">
                  {pendientes.length > 9 ? '9+' : pendientes.length}
                </span>
              )}
              {t === 'cobrar' && porCobrar.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-medium">
                  {porCobrar.length > 9 ? '9+' : porCobrar.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ══ Menú ══ */}
      {tab === 'menu' && (
        <div className="flex flex-col md:flex-row md:min-h-screen bg-[#FAFAF6]">

          {/* Columna izquierda */}
          <div className="flex-1 overflow-y-auto">

            {/* Cabecera — dos layouts según nivel de navegación */}
            <div className="bg-sanpedro-wood px-4 sm:px-6 py-4">
              {categoriaActiva && !busquedaMenu ? (
                /* ── Nivel 2: botón volver real + nombre de categoría + contador ── */
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCategoriaActiva(null)}
                    className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-sanpedro-gold/40 text-sanpedro-gold/80 hover:text-sanpedro-gold hover:border-sanpedro-gold/70 hover:bg-white/10 text-sm font-medium transition-colors duration-200 shrink-0"
                  >
                    ← Menú
                  </button>
                  <h1 className="flex-1 text-xl sm:text-2xl font-medium text-white tracking-tight truncate">
                    {categoriaActiva}
                  </h1>
                  <p className="text-sanpedro-gold/60 text-xs font-medium whitespace-nowrap shrink-0">
                    {menuDeCat.length} platillo(s)
                  </p>
                </div>
              ) : (
                /* ── Nivel 1 o búsqueda: marca secundaria + título principal + contador ── */
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sanpedro-gold/60 text-[10px] font-medium tracking-[0.2em] uppercase mb-0.5">
                      San Pedro
                    </p>
                    <h1 className="text-2xl font-medium text-white tracking-tight">
                      {busquedaMenu ? 'Búsqueda' : 'Menú'}
                    </h1>
                  </div>
                  <p className="text-sanpedro-gold/60 text-xs font-medium whitespace-nowrap shrink-0">
                    {busquedaMenu
                      ? `${resultadosBusqueda.length} resultado(s)`
                      : `${categoriasOrdenadas.length} categorías`}
                  </p>
                </div>
              )}
            </div>
            <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60" />

            {/* Buscador sticky */}
            <div className="sticky top-0 z-10 px-4 py-3 bg-white border-b border-stone-100 shadow-sm">
              <div className="relative">
                <input
                  type="text"
                  value={busquedaMenu}
                  onChange={e => setBusquedaMenu(e.target.value)}
                  placeholder="Buscar platillo…"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold/40 focus:border-sanpedro-gold bg-[#FAFAF6]"
                />
                <span className="absolute left-3 top-3 text-stone-400 text-sm pointer-events-none">🔍</span>
                {busquedaMenu && (
                  <button
                    onClick={() => setBusquedaMenu('')}
                    className="absolute right-3 top-2 text-stone-400 hover:text-sanpedro-wood p-0.5 leading-none"
                    aria-label="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {cargando ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-sanpedro-wood text-sm tracking-wide">Cargando menú…</p>
              </div>

            ) : busquedaMenu ? (
              resultadosBusqueda.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <p className="text-stone-400 text-sm">Sin resultados para "{busquedaMenu}".</p>
                </div>
              ) : (
                <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-24 md:pb-6">
                  {resultadosBusqueda.map(item => renderItem(item))}
                </div>
              )

            ) : categoriaActiva === null ? (
              /* ── Nivel 1 — Mosaico de categorías ── */
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoriasOrdenadas.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoriaActiva(cat)}
                    className="bg-white rounded-2xl shadow-sm border border-stone-200 border-t-[3px] border-t-sanpedro-gold hover:shadow-md active:scale-[0.97] transition-all duration-200 p-6 flex flex-col min-h-[140px] text-left"
                  >
                    <span className="text-2xl">{CATEGORIA_ICONOS[cat] ?? '🍽'}</span>
                    <h3 className="text-base font-medium text-sanpedro-dark leading-snug mt-3">{cat}</h3>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-stone-400">
                      {conteoPorCat[cat]} platillos
                    </p>
                  </button>
                ))}
              </div>

            ) : (
              /* ── Nivel 2 — Platillos de la categoría ── */
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-24 md:pb-6">
                {menuDeCat.map(item => renderItem(item))}
              </div>
            )}
          </div>

          {/* Carrito escritorio */}
          <aside className="hidden md:flex md:w-80 lg:w-96 flex-col md:sticky md:top-0 md:h-screen border-l border-stone-200 bg-white">
            <div className="bg-sanpedro-wood px-5 py-4">
              <h2 className="text-base font-medium text-white tracking-tight">Pedido Actual</h2>
              <p className="text-sanpedro-gold/60 text-xs mt-0.5">
                {carrito.length === 0 ? 'Sin artículos' : `${totalItems} artículo(s)`}
              </p>
            </div>
            <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60" />
            {carritoLineas}
            {carritoFooter}
          </aside>

          {/* FAB móvil */}
          {carrito.length > 0 && (
            <button
              onClick={() => setCarritoAbierto(true)}
              className="fixed bottom-6 right-4 z-40 md:hidden bg-sanpedro-gold text-sanpedro-dark font-medium rounded-full shadow-xl flex items-center gap-2 px-5 min-h-[56px]"
            >
              🛒 <span>{totalItems}</span>
              <span className="text-sanpedro-dark/50">·</span>
              <span>${total.toFixed(2)}</span>
            </button>
          )}

          {/* Bottom sheet móvil */}
          {carritoAbierto && (
            <div
              className="fixed inset-0 z-50 md:hidden flex flex-col justify-end"
              onClick={() => setCarritoAbierto(false)}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="relative bg-white rounded-t-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '85svh' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="bg-sanpedro-wood px-5 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-base font-medium text-white tracking-tight">Pedido Actual</h2>
                    <p className="text-sanpedro-gold/60 text-xs mt-0.5">
                      {carrito.length === 0 ? 'Sin artículos' : `${totalItems} artículo(s)`}
                    </p>
                  </div>
                  <button
                    onClick={() => setCarritoAbierto(false)}
                    className="text-white/60 hover:text-white w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 shrink-0 transition-colors duration-200"
                    aria-label="Cerrar carrito"
                  >
                    ✕
                  </button>
                </div>
                <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60 shrink-0" />
                {carritoLineas}
                {carritoFooter}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ En cola ══ */}
      {tab === 'cola' && (
        <div className="p-4 sm:p-6 bg-[#FAFAF6] min-h-screen">
          {pendientes.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-stone-400 text-sm">No hay pedidos pendientes.</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {pendientes.map(p => (
                <div key={p.pedidoId} className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-[3px] border-t-sanpedro-gold overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <span className="text-sanpedro-gold font-medium text-3xl leading-tight tracking-tight">{p.pedidoMesa ?? '—'}</span>
                        {p.pedidoClienteNombre && (
                          <p className="text-xs text-stone-400 mt-0.5">{p.pedidoClienteNombre}</p>
                        )}
                      </div>
                      <span className="shrink-0 bg-amber-50 text-amber-600 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200">
                        {tiempoTranscurrido(p.pedidoCreadoEn)}
                      </span>
                    </div>

                    <ul className="text-sm text-stone-600 space-y-1.5 mb-4 border-t border-stone-100 pt-3">
                      {p.detallesPedido.map((d, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{d.detallePedidoCantidad}× {d.platillos?.[0]?.platilloNombre ?? '—'}</span>
                          <span className="text-stone-400 text-xs self-end ml-4">${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex justify-end mb-4 border-t border-stone-100 pt-3">
                      <span className="text-base font-medium text-sanpedro-wood tracking-tight">${p.pedidoTotal.toFixed(2)}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => marcarEntregado(p.pedidoId)}
                        className="flex-1 bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-medium text-sm py-3 rounded-lg transition-colors duration-200 min-h-[44px]"
                      >
                        Marcar entregado
                      </button>
                      <button
                        onClick={() => cancelarPedido(p.pedidoId)}
                        className="px-4 py-3 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors duration-200 min-h-[44px]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Por Cobrar ══ */}
      {tab === 'cobrar' && (
        <div className="p-4 sm:p-6 bg-[#FAFAF6] min-h-screen">
          {porCobrar.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-1.5">
              <p className="text-stone-400 text-sm">Sin pedidos por cobrar.</p>
              <p className="text-stone-300 text-xs">Los pedidos entregados aparecen aquí hasta que se registre el pago.</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {porCobrar.map(p => {
                const abierto      = expandidoCobro === p.pedidoId;
                const cargandoEste = cobrando === p.pedidoId;
                const lineas       = detallesCobro[p.pedidoId];
                return (
                  <div key={p.pedidoId} className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-[3px] border-t-sanpedro-gold overflow-hidden">
                    {/* Cabecera siempre visible — tap para ver desglose */}
                    <button
                      className="w-full text-left p-5 flex items-start justify-between gap-3 min-h-[72px]"
                      onClick={() => expandirCobro(p.pedidoId)}
                    >
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Pedido</span>
                        <p className="text-sanpedro-gold font-medium text-xl leading-tight tracking-tight mt-0.5">
                          #{p.pedidoId.slice(0, 8)}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-1">
                          Entregado {fmtHoraGYE(p.pedidoEntregadoEn)}
                        </p>
                        {p.pedidoMesa && (
                          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-0.5">
                            Mesa: {p.pedidoMesa}
                          </p>
                        )}
                        {p.pedidoMeseroNombre && (
                          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-0.5">
                            Mesero: {p.pedidoMeseroNombre}
                          </p>
                        )}
                        {p.pedidoClienteNombre && (
                          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-0.5">
                            Cliente: {p.pedidoClienteNombre}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-medium text-sanpedro-wood tracking-tight">
                          ${Number(p.pendienteTotal).toFixed(2)}
                        </p>
                        <span className="text-stone-300 text-xs">{abierto ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Desglose expandible — cargado bajo demanda */}
                    {abierto && (
                      <div className="px-5 pb-3 border-t border-stone-100">
                        {lineas === undefined ? (
                          <p className="text-xs text-stone-400 py-3">Cargando desglose…</p>
                        ) : lineas.length === 0 ? (
                          <p className="text-xs text-stone-400 py-3">Sin líneas registradas.</p>
                        ) : (
                          <ul className="text-sm text-stone-600 space-y-1.5 mt-3">
                            {lineas.map((d, i) => (
                              <li key={i} className="flex justify-between">
                                <span>{d.detallePedidoCantidad}× {d.platillos?.[0]?.platilloNombre ?? '—'}</span>
                                <span className="text-stone-400 text-xs self-end ml-4">
                                  ${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="border-t border-stone-100 mt-3 pt-3 flex justify-between items-baseline">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Total</span>
                          <span className="text-lg font-medium text-sanpedro-wood tracking-tight">
                            ${Number(p.pendienteTotal).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Botones de cobro */}
                    <div className="px-5 pb-5 pt-3 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => cobrarPedido(p.pedidoId, 'efectivo')}
                        disabled={cargandoEste}
                        className="bg-sanpedro-gold hover:bg-sanpedro-gold-dark text-sanpedro-dark font-medium text-sm py-3 rounded-xl transition-colors duration-200 min-h-[44px] disabled:opacity-50"
                      >
                        Efectivo
                      </button>
                      <button
                        onClick={() => cobrarPedido(p.pedidoId, 'transferencia')}
                        disabled={cargandoEste}
                        className="border border-sanpedro-gold/60 text-sanpedro-gold-dark font-medium text-sm py-3 rounded-xl hover:bg-sanpedro-gold/10 transition-colors duration-200 min-h-[44px] disabled:opacity-50"
                      >
                        Transferencia
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Historial ══ */}
      {tab === 'historial' && (
        <div className="p-4 sm:p-6 bg-[#FAFAF6] min-h-screen">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5 max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-[0.12em] text-stone-500 shrink-0">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold/40 focus:border-sanpedro-gold"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-[0.12em] text-stone-500 shrink-0">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-sanpedro-gold/40 focus:border-sanpedro-gold"
              />
            </div>
          </div>

          {historial.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-stone-400 text-sm">Sin pedidos en este rango de fechas.</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl mx-auto">
              {historial.map(p => {
                const abierto     = expandido === p.pedidoId;
                const esEntregado = p.pedidoEstado === 'entregado';
                return (
                  <div key={p.pedidoId} className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                    <button
                      className="w-full text-left p-4 flex items-center gap-3 min-h-[56px]"
                      onClick={() => setExpandido(abierto ? null : p.pedidoId)}
                    >
                      <span className="text-sanpedro-gold font-medium text-xl leading-tight w-20 shrink-0 truncate tracking-tight">{p.pedidoMesa ?? '—'}</span>
                      <span className="flex-1 text-xs text-stone-400 truncate">{p.pedidoClienteNombre ?? ''}</span>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${
                        esEntregado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-200'
                      }`}>
                        {esEntregado ? 'Entregado' : 'Cancelado'}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-sanpedro-wood ml-2 tracking-tight">${p.pedidoTotal.toFixed(2)}</span>
                      <span className="shrink-0 text-xs text-stone-400 ml-2">
                        {new Date(p.pedidoCreadoEn).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="shrink-0 text-stone-300 ml-1 text-xs">{abierto ? '▲' : '▼'}</span>
                    </button>

                    {abierto && (
                      <div className="px-4 pb-4 border-t border-stone-100">
                        <ul className="text-sm text-stone-600 space-y-1.5 mt-3">
                          {p.detallesPedido.map((d, i) => (
                            <li key={i} className="flex justify-between">
                              <span>{d.detallePedidoCantidad}× {d.platillos?.[0]?.platilloNombre ?? '—'}</span>
                              <span className="text-stone-400 text-xs self-end ml-4">${(d.detallePedidoCantidad * d.detallePedidoPrecioUnitario).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                        {p.pedidoMetodoPago && (
                          <div className="mt-3 pt-2 border-t border-stone-100 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                              {p.pedidoMetodoPago}
                            </span>
                            {p.pedidoPagadoEn && (
                              <span className="text-[10px] text-stone-400">
                                Cobrado {fmtHoraGYE(p.pedidoPagadoEn)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Modal — Selección de carne ══ */}
      {hibridoActivo && (
        <div
          className="fixed inset-0 bg-sanpedro-dark/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setHibridoActivo(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-sanpedro-wood px-6 py-4">
              <h3 className="text-base font-medium text-white tracking-tight">{hibridoActivo.nombreBase}</h3>
              <p className="text-sanpedro-gold/70 text-sm mt-0.5 tracking-tight">${hibridoActivo.precio.toFixed(2)}</p>
            </div>
            <div className="h-px bg-gradient-to-r from-sanpedro-gold/60 via-sanpedro-gold to-sanpedro-gold/60" />
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mb-3">Elige tu corte</p>
              <div className="space-y-2">
                {hibridoActivo.variaciones.map(v => (
                  <button
                    key={v.platilloId}
                    onClick={() => confirmarCarne(v, hibridoActivo)}
                    className="w-full text-left border border-stone-200 hover:border-sanpedro-gold/50 hover:bg-sanpedro-gold/8 rounded-xl px-4 py-3.5 text-sm font-medium text-sanpedro-dark transition-colors duration-200 min-h-[48px]"
                  >
                    {v.carne}
                  </button>
                ))}
              </div>
              <button onClick={() => setHibridoActivo(null)} className="mt-4 w-full text-center text-sm text-stone-400 hover:text-sanpedro-wood transition-colors duration-200 py-2">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
