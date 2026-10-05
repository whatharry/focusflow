import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Depth comes from a border and a surface step, not from shadow stacking.
 * `emphasis` is reserved for the next action — the one card allowed to look like
 * it matters more than its neighbours.
 */
interface CardProps extends ComponentPropsWithoutRef<'div'> {
  emphasis?: boolean
  children: ReactNode
}

export function Card({ emphasis = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-5 sm:p-6',
        emphasis
          ? 'border-accent/35 bg-raised shadow-elev-1'
          : 'border-line bg-surface shadow-elev-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
