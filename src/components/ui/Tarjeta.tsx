import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  destacada?:  boolean;
  acento?:     boolean;
  sinPadding?: boolean;
}

export default function Tarjeta({
  destacada,
  acento,
  sinPadding,
  className = '',
  children,
  ...rest
}: Props) {
  let bg:      string;
  let border:  string;
  let rounded: string;

  if (acento) {
    bg      = 'bg-tarjeta';
    border  = 'border border-linea border-l-[3px] border-l-oro';
    rounded = 'rounded-none';
  } else if (destacada) {
    bg      = 'bg-oro-tinte';
    border  = 'border border-oro-borde';
    rounded = 'rounded-xl';
  } else {
    bg      = 'bg-tarjeta';
    border  = 'border border-linea';
    rounded = 'rounded-xl';
  }

  const padding = sinPadding ? '' : 'px-[14px] py-3';

  return (
    <div className={`${bg} ${border} ${rounded} ${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}
