export type RolUsuario = 'administrador' | 'mesero';

export interface Perfil {
  perfilId: string;
  perfilNombre: string;
  perfilRol: RolUsuario;
  perfilActivo: boolean;
  perfilCreadoEn: string;
}

export interface Platillo {
  platilloId: string;
  platilloNombre: string;
  platilloDescripcion: string;
  platilloPrecio: number;
  platilloCategoria: string;
  platilloImagenUrl: string | null;
  platilloDisponible: boolean;
  platilloArchivado: boolean;
}

export interface DetallePedido {
  detallePedidoCantidad: number;
  detallePedidoPrecioUnitario: number;
  detallePedidoPlatilloNombre: string | null;
}

export interface LineaCarrito {
  platilloId: string;
  platilloNombre: string;
  platilloPrecio: number;
  cantidad: number;
  variacionCarne?: string;
}

export interface PlatilloAgrupadoUI {
  nombreBase: string;
  descripcion: string;
  precio: number;
  categoria: string;
  esHibrido: boolean;
  variaciones: {
    carne: string;
    platilloId: string;
  }[];
}
