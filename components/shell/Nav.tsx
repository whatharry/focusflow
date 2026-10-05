'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Three destinations. A fourth would be a fourth thing to think about, and the
 * product's whole claim is that there is only one thing to think about.
 *
 * Left rail from `md` up, bottom bar on phones — where the thumb already is.
 */
const ITEMS = [
  { href: '/today', label: 'Today' },
  { href: '/projects', label: 'Projects' },
  { href: '/settings', label: 'Settings' },
] as const

export function Nav() {
  const pathname = usePathname()

  return (
    <>
      {/* Phones: bottom bar. */}
      <nav
        aria-label="Main"
        className="ff-safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="flex">
          {ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center px-2 py-3 text-small font-medium',
                    active ? 'text-ink' : 'text-faint',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Desktop: slim left rail. */}
      <nav
        aria-label="Main"
        className="ff-safe-top sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-1 border-r border-line px-4 pb-6 md:flex"
      >
        <p className="ff-label mb-6 px-2">FocusFlow</p>
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-small font-medium transition-colors duration-[120ms]',
                active ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
