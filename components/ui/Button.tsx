import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * One primary button per screen, ever. `primary` is the filled accent and should
 * be the only one on a given surface; everything else recedes.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'lg' | 'md' | 'sm'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-elev-1',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-raised',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-ink hover:bg-raised',
  danger: 'bg-transparent text-danger border border-transparent hover:bg-raised',
}

/* Never below 44px on the two larger sizes — thumb-reachable on a phone. */
const SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-[44px] px-5 text-body',
  md: 'min-h-[44px] px-4 text-small',
  sm: 'min-h-[36px] px-3 text-small',
}

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors duration-[120ms] ease-[var(--ease-calm)]',
        'disabled:opacity-45 disabled:hover:bg-transparent',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
