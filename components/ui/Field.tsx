import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const CONTROL = [
  'w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-body text-ink',
  'min-h-[44px] transition-colors duration-[120ms] ease-[var(--ease-calm)]',
  'hover:border-line-strong focus:border-accent focus:outline-none',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
].join(' ')

interface FieldShellProps {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string | undefined
  /** Visually hide the label but keep it for screen readers. */
  labelHidden?: boolean
  children: ReactNode
}

export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  labelHidden = false,
  children,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={labelHidden ? 'sr-only' : 'ff-label'}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-small text-faint">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type TextInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'id'> & {
  id: string
  label: string
  hint?: ReactNode
  error?: string | undefined
  labelHidden?: boolean
}

export function TextInput({
  id,
  label,
  hint,
  error,
  labelHidden,
  className,
  ...props
}: TextInputProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} labelHidden={labelHidden}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CONTROL, error && 'border-danger', className)}
        {...props}
      />
    </FieldShell>
  )
}

type TextAreaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> & {
  id: string
  label: string
  hint?: ReactNode
  error?: string | undefined
  labelHidden?: boolean
}

export function TextArea({
  id,
  label,
  hint,
  error,
  labelHidden,
  className,
  ...props
}: TextAreaProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} labelHidden={labelHidden}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CONTROL, 'resize-y leading-relaxed', error && 'border-danger', className)}
        {...props}
      />
    </FieldShell>
  )
}

type SelectProps = Omit<ComponentPropsWithoutRef<'select'>, 'id'> & {
  id: string
  label: string
  hint?: ReactNode
  error?: string | undefined
  labelHidden?: boolean
}

export function Select({
  id,
  label,
  hint,
  error,
  labelHidden,
  className,
  children,
  ...props
}: SelectProps) {
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} labelHidden={labelHidden}>
      <select id={id} className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
    </FieldShell>
  )
}
