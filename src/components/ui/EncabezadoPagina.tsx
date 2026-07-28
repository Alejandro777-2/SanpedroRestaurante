import type { ReactNode } from 'react';

interface Props {
  titulo:     string;
  subtitulo?: string;
  metadatos?: string;
  acciones?:  ReactNode;
}

export default function EncabezadoPagina({ titulo, subtitulo, metadatos, acciones }: Props) {
  return (
    <div className="pb-4 border-b border-linea mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-medium text-tinta leading-tight">{titulo}</h1>
          {subtitulo && <p className="text-[13px] text-tinta-media mt-0.5">{subtitulo}</p>}
          {metadatos && <p className="text-[11px] text-tinta-suave mt-0.5">{metadatos}</p>}
        </div>
        {acciones && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{acciones}</div>
        )}
      </div>
    </div>
  );
}
