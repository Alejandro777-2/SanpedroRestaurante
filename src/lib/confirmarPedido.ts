import { supabase } from '../supabaseClient';
import type { LineaCarrito } from '../types';

export interface DatosPedido {
  mesa: string;
  clienteNombre?: string;
  meseroId?: string | null;
  observacion?: string | null;
}

export async function confirmarPedido(
  carrito: LineaCarrito[],
  datos: DatosPedido
): Promise<{ pedidoId: string }> {
  if (carrito.length === 0) throw new Error('El carrito está vacío.');

  const total = carrito.reduce(
    (sum, l) => sum + l.platilloPrecio * l.cantidad,
    0
  );

  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      pedidoClienteNombre: datos.clienteNombre ?? null,
      pedidoMesa: datos.mesa,
      pedidoTotal: Number(total.toFixed(2)),
      pedidoMeseroId: datos.meseroId ?? null,
      pedidoObservacion: datos.observacion ?? null,
    })
    .select('pedidoId')
    .single();

  if (errorPedido || !pedido) {
    throw new Error(`No se pudo crear el pedido: ${errorPedido?.message}`);
  }

  const detalles = carrito.map((l) => ({
    detallePedidoPedidoId: pedido.pedidoId,
    detallePedidoPlatilloId: l.platilloId,
    detallePedidoCantidad: l.cantidad,
    detallePedidoPrecioUnitario: l.platilloPrecio,
  }));

  const { error: errorDetalle } = await supabase
    .from('detallesPedido')
    .insert(detalles);

  if (errorDetalle) {
    await supabase.from('pedidos').delete().eq('pedidoId', pedido.pedidoId);
    throw new Error(`No se pudo guardar el detalle: ${errorDetalle.message}`);
  }

  return { pedidoId: pedido.pedidoId };
}
