import { AuthShell } from '@/components/auth/AuthShell'
import { ResetRequestForm } from '@/components/auth/ResetRequestForm'

export const metadata = { title: 'Reset password · FocusFlow' }

export default function ResetPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new one.">
      <ResetRequestForm />
    </AuthShell>
  )
}
