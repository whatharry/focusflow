import type { ReactNode } from 'react'

/** Centred, quiet frame shared by every authentication screen. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="ff-safe-top ff-safe-bottom flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="ff-rise mx-auto w-full max-w-sm">
        <p className="ff-label mb-8">FocusFlow</p>
        <h1 className="text-h1 font-semibold">{title}</h1>
        {subtitle ? <p className="mt-2 text-body text-muted">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-small text-muted">{footer}</div> : null}
      </div>
    </main>
  )
}
