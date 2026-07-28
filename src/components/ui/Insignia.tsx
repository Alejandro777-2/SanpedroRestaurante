type Tono = 'exito' | 'aviso' | 'peligro' | 'oro' | 'neutro';

interface Props {
  tono?:     Tono;
  children:  React.ReactNode;
  className?: string;
}

const TONO: Record<Tono, string> = {
  exito:  'bg-exito-tinte text-exito',
  aviso:  'bg-aviso-tinte text-aviso',
  peligro:'bg-peligro-tinte text-peligro',
  oro:    'bg-oro-tinte text-oro-tinta',
  neutro: 'bg-linea-suave text-tinta-media',
};

export default function Insignia({ tono = 'neutro', children, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-[9px] py-[3px] text-[11px] font-medium leading-none ${TONO[tono]} ${className}`}>
      {children}
    </span>
  );
}
