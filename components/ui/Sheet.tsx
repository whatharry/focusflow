'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A bottom sheet on phones, a centred dialog from `sm` up.
 *
 * Built on the native <dialog> element: focus trapping, Escape-to-close and
 * inertness of the page behind come for free and correct, which is a lot of
 * accessibility for no code.
 */
interface SheetProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog. */
  title: string
  /** Render the title visibly as well. */
  showTitle?: boolean
  children: ReactNode
}

export function Sheet({ open, onClose, title, showTitle = true, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        // Let the parent own `open` rather than the DOM closing behind its back.
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) dismisses.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'ff-rise m-0 w-full max-w-none border border-line bg-surface p-0 text-ink shadow-elev-2',
        'mt-auto rounded-t-lg rounded-b-none',
        'sm:m-auto sm:max-w-lg sm:rounded-lg',
        'backdrop:bg-black/40 open:flex open:flex-col',
      )}
    >
      <div className="ff-safe-bottom max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
        {showTitle ? <h2 className="text-h2 font-semibold">{title}</h2> : null}
        {children}
      </div>
    </dialog>
  )
}
