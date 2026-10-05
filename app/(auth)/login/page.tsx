import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = { title: 'Sign in · FocusFlow' }

const LINK_ERRORS: Record<string, string> = {
  link_expired: 'That link has expired. Request a new reset email and try again.',
  link_invalid: 'That link was not valid. Request a new reset email and try again.',
}

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  const linkError = typeof params.error === 'string' ? LINK_ERRORS[params.error] : undefined

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer="Your projects, tasks and focus history sync across every device you sign in on."
    >
      {linkError ? (
        <p role="alert" className="mb-5 rounded-sm border border-line bg-raised px-3 py-2.5 text-small text-danger">
          {linkError}
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  )
}
