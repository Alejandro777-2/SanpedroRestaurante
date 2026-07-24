import { supabase } from '../supabaseClient';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type IngredienteBase = {
  ingredienteId: string;
  ingredienteNombre: string;
  ingredienteUnidad: string;
};

export type Ingrediente = IngredienteBase & {
  ingredienteStock: number;
  ingredienteStockMin: number;
  ingredienteActivo: boolean;
};

export type StockItem = {
  ingredienteId: string;
  ingredienteNombre: string;
  ingredienteUnidad: string;
  ingredienteActivo: boolean;
  stockReal: number;
  comprometido: number;
  stockDisponible: number;
  ingredienteStockMin: number;
};

export type MovimientoTipo = 'entrada' | 'salida' | 'ajuste' | 'devolucion';

export type MovimientoConDetalle = {
  movimientoId: string;
  movimientoTipo: MovimientoTipo;
  movimientoCantidad: number;
  movimientoNota: string | null;
  movimientoCreadoEn: string;
  ingredientes: { ingredienteNombre: string; ingredienteUnidad: string } | null;
  perfiles: { perfilNombre: string } | null;
};

// ── Consultas ─────────────────────────────────────────────────────────────────

export async function listarStock(): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from('vistaStockDisponible')
    .select('*')
    .order('ingredienteNombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as StockItem[];
}

export async function listarIngredientesActivos(): Promise<IngredienteBase[]> {
  const { data, error } = await supabase
    .from('ingredientes')
    .select('ingredienteId, ingredienteNombre, ingredienteUnidad')
    .eq('ingredienteActivo', true)
    .order('ingredienteNombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredienteBase[];
}

// ── Recetas ──────────────────────────────────────────────────────────────────

export type RecetaLinea = {
  recetaId: string;
  recetaCantidad: number;
  ingredientes: {
    ingredienteId: string;
    ingredienteNombre: string;
    ingredienteUnidad: string;
  } | null;
};

export type PlatilloConReceta = {
  platilloId: string;
  platilloNombre: string;
  platilloCategoria: string;
  recetas: RecetaLinea[];
};

export async function listarPlatillosConRecetas(): Promise<PlatilloConReceta[]> {
  const { data, error } = await supabase
    .from('platillos')
    .select(`
      platilloId, platilloNombre, platilloCategoria,
      recetas (
        recetaId, recetaCantidad,
        ingredientes ( ingredienteId, ingredienteNombre, ingredienteUnidad )
      )
    `)
    .eq('platilloArchivado', false)
    .order('platilloCategoria')
    .order('platilloNombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatilloConReceta[];
}

export async function agregarReceta(datos: {
  platilloId: string;
  ingredienteId: string;
  cantidad: number;
}): Promise<void> {
  const { error } = await supabase.from('recetas').insert({
    recetaPlatilloId:    datos.platilloId,
    recetaIngredienteId: datos.ingredienteId,
    recetaCantidad:      datos.cantidad,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarCantidadReceta(recetaId: string, cantidad: number): Promise<void> {
  const { error } = await supabase
    .from('recetas')
    .update({ recetaCantidad: cantidad })
    .eq('recetaId', recetaId);
  if (error) throw new Error(error.message);
}

export async function eliminarReceta(recetaId: string): Promise<void> {
  const { error } = await supabase.from('recetas').delete().eq('recetaId', recetaId);
  if (error) throw new Error(error.message);
}

// ── Movimientos ───────────────────────────────────────────────────────────────

export async function listarMovimientos(filtros: {
  ingredienteId?: string;
  tipo?: string;
  gte?: string;
  lte?: string;
}): Promise<MovimientoConDetalle[]> {
  let q = supabase
    .from('movimientosInventario')
    .select(`
      movimientoId, movimientoTipo, movimientoCantidad, movimientoNota, movimientoCreadoEn,
      ingredientes ( ingredienteNombre, ingredienteUnidad ),
      perfiles ( perfilNombre )
    `)
    .order('movimientoCreadoEn', { ascending: false })
    .limit(300);

  if (filtros.ingredienteId) q = q.eq('movimientoIngredienteId', filtros.ingredienteId);
  if (filtros.tipo)          q = q.eq('movimientoTipo', filtros.tipo);
  if (filtros.gte)           q = q.gte('movimientoCreadoEn', filtros.gte);
  if (filtros.lte)           q = q.lte('movimientoCreadoEn', filtros.lte);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MovimientoConDetalle[];
}

// ── CRUD ingredientes ─────────────────────────────────────────────────────────

export async function crearIngrediente(datos: {
  ingredienteNombre: string;
  ingredienteUnidad: string;
  ingredienteStock: number;
  ingredienteStockMin: number;
}): Promise<void> {
  const { error } = await supabase.from('ingredientes').insert({ ...datos, ingredienteActivo: true });
  if (error) throw new Error(error.message);
}

export async function actualizarIngrediente(
  id: string,
  datos: Partial<Omit<Ingrediente, 'ingredienteId'>>
): Promise<void> {
  const { error } = await supabase.from('ingredientes').update(datos).eq('ingredienteId', id);
  if (error) throw new Error(error.message);
}

export async function toggleActivoIngrediente(id: string, activo: boolean): Promise<void> {
  await actualizarIngrediente(id, { ingredienteActivo: activo });
}

// ── Movimiento de stock ───────────────────────────────────────────────────────

/**
 * Registra una entrada o ajuste: actualiza ingredienteStock e inserta en movimientosInventario.
 * Si el insert del movimiento falla, revierte el cambio de stock (transacción compensatoria).
 * ponytail: read-modify-write — race condition posible con múltiples usuarios simultáneos.
 *           Upgrade a una función RPC de Postgres si la concurrencia lo requiere.
 */
export async function registrarMovimiento(datos: {
  ingredienteId: string;
  cantidad: number;
  tipo: 'entrada' | 'ajuste';
  nota?: string;
  usuarioId: string;
}): Promise<void> {
  // 1. Leer stock actual para calcular nuevo valor y poder revertir
  const { data: actual, error: e0 } = await supabase
    .from('ingredientes')
    .select('ingredienteStock')
    .eq('ingredienteId', datos.ingredienteId)
    .single();
  if (e0 || !actual) throw new Error('No se pudo leer el stock actual.');

  const stockActual = (actual as { ingredienteStock: number }).ingredienteStock;
  const nuevoStock  = stockActual + datos.cantidad;

  // 2. Actualizar stock
  const { error: e1 } = await supabase
    .from('ingredientes')
    .update({ ingredienteStock: nuevoStock })
    .eq('ingredienteId', datos.ingredienteId);
  if (e1) throw new Error(`Error al actualizar stock: ${e1.message}`);

  // 3. Insertar movimiento — si falla, revertir el stock
  const { error: e2 } = await supabase.from('movimientosInventario').insert({
    movimientoIngredienteId: datos.ingredienteId,
    movimientoTipo:          datos.tipo,
    movimientoCantidad:      datos.cantidad,
    movimientoUsuarioId:     datos.usuarioId,
    movimientoNota:          datos.nota ?? null,
  });

  if (e2) {
    await supabase
      .from('ingredientes')
      .update({ ingredienteStock: stockActual })
      .eq('ingredienteId', datos.ingredienteId);
    throw new Error(`Error al registrar movimiento: ${e2.message}`);
  }
}
