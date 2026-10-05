import { AuthShell } from '@/components/auth/AuthShell'
import { NewPasswordForm } from '@/components/auth/NewPasswordForm'

export const metadata = { title: 'New password · FocusFlow' }

/**
 * Landing page for the emailed reset link. Supabase's client library exchanges the
 * recovery token in the URL fragment for a session automatically, which is why
 * this page only has to collect the new password.
 */
export default function ResetConfirmPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Then you'll go straight to Today."
      footer="If this link has expired, request a new one from the sign-in screen."
    >
      <NewPasswordForm />
    </AuthShell>
  )
}
