import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'peligro' | 'texto' | 'icono';
type Tamanio  = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanio?:  Tamanio;
}

const BASE =
  'inline-flex items-center justify-center font-medium transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oro ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTE: Record<Variante, string> = {
  primario:   'bg-oro text-carbon rounded-lg hover:opacity-90',
  secundario: 'bg-tarjeta border border-linea text-tinta rounded-lg hover:bg-linea-suave',
  peligro:    'bg-tarjeta border border-peligro-borde text-peligro rounded-lg hover:bg-peligro-tinte',
  texto:      'text-tinta-media hover:underline rounded',
  icono:      'border border-linea rounded-lg text-tinta hover:bg-linea-suave',
};

const TAMANIO: Record<Tamanio, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2 min-h-[44px]',
};

const ICONO_SIZE: Record<Tamanio, string> = {
  sm: 'w-8 h-8',
  md: 'w-11 h-11',
};

export default function Boton({
  variante = 'primario',
  tamanio  = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  const size = variante === 'icono' ? ICONO_SIZE[tamanio] : TAMANIO[tamanio];
  return (
    <button className={`${BASE} ${VARIANTE[variante]} ${size} ${className}`} {...rest}>
      {children}
    </button>
  );
}
