import { redirect } from 'next/navigation'
import { Nav } from '@/components/shell/Nav'
import { getViewer } from '@/server/queries/today'

/**
 * Shell for every signed-in screen. Focus Mode deliberately lives outside this
 * group: it renders no navigation at all.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already gates this, but a layout that assumes a user without
  // checking is one refactor away from leaking an empty screen.
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  return (
    <div className="flex min-h-dvh">
      <Nav />
      {/* pb-24 clears the fixed bottom bar on phones. */}
      <main className="ff-safe-top min-w-0 flex-1 px-5 pb-24 md:px-10 md:pb-10">{children}</main>
    </div>
  )
}
