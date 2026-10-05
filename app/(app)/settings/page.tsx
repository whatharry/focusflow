import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { signOut } from '@/server/actions/auth'
import { getViewer } from '@/server/queries/today'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Settings' }

/**
 * A handful of common zones, plus whatever the device reports and whatever is
 * already saved. `Intl.supportedValuesOf` would give all ~400, which is a worse
 * experience than a short list for a single-user app.
 */
const COMMON_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
] as const

export default async function SettingsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="pt-8 pb-6 sm:pt-10">
        <h1 className="text-h2 font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-small text-muted">{viewer.email ?? 'Signed in'}</p>
      </header>

      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="text-h3 font-semibold">You</h2>
          <ProfileForm
            displayName={viewer.displayName}
            timeZone={viewer.timeZone}
            zones={COMMON_ZONES}
          />
        </Card>

        <Card>
          <h2 className="text-h3 font-semibold">Session</h2>
          <p className="mt-2 text-small text-muted">
            Your work is stored on the server, so signing in on another device shows the same
            tasks and the same focus session.
          </p>
          <form action={signOut} className="mt-5 flex justify-end">
            <Button type="submit" variant="secondary" size="md">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
