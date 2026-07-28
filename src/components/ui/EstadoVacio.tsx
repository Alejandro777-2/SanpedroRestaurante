import type { ReactNode } from 'react';

interface Props {
  icono:        string;
  titulo:       string;
  descripcion?: string;
  accion?:      ReactNode;
}

export default function EstadoVacio({ icono, titulo, descripcion, accion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
      <span className="text-3xl text-tinta-suave">{icono}</span>
      <p className="text-sm font-medium text-tinta-media">{titulo}</p>
      {descripcion && <p className="text-xs text-tinta-suave max-w-xs">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
