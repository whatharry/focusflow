import { redirect } from 'next/navigation'

/**
 * There is no marketing page. The root exists only so a bare domain lands
 * somewhere useful; proxy.ts normally redirects before this renders.
 */
export default function RootPage() {
  redirect('/today')
}
