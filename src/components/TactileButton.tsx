import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type TactileVariant = 'primary' | 'emerald' | 'crimson' | 'info' | 'neutral';

interface TactileButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TactileVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<TactileVariant, string> = {
  primary: 'btn-3d-primary',
  emerald: 'btn-3d-emerald',
  crimson: 'btn-3d-crimson',
  info: 'btn-3d-info',
  neutral: 'btn-3d-neutral',
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function TactileButton({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: TactileButtonProps) {
  return (
    <button
      type={type}
      className={`btn-3d ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
