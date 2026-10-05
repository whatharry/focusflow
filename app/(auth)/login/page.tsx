import { LoginScreen } from '@/components/auth/LoginScreen'

export const metadata = { title: 'Sign in · FocusFlow' }

const LINK_ERRORS: Record<string, string> = {
  link_expired: 'That link has expired. Request a new reset email and try again.',
  link_invalid: 'That link was not valid. Request a new reset email and try again.',
}

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  const linkError = typeof params.error === 'string' ? LINK_ERRORS[params.error] : undefined

  return <LoginScreen next={next} linkError={linkError} />
}
