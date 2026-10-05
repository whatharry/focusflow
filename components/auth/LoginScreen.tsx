'use client'

import { useState } from 'react'
import { AuthShell } from './AuthShell'
import { LoginForm } from './LoginForm'
import { AUTH_COPY, type AuthMode } from './modes'

/**
 * Owns the sign-in / sign-up mode so the heading, the button and the fields all
 * agree with each other.
 */
export function LoginScreen({
  next,
  linkError,
}: {
  next: string | undefined
  linkError: string | undefined
}) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const copy = AUTH_COPY[mode]

  return (
    <AuthShell
      title={copy.title}
      subtitle={copy.subtitle}
      footer="Your projects, tasks and focus history sync across every device you sign in on."
    >
      {linkError ? (
        <p
          role="alert"
          className="mb-5 rounded-sm border border-line bg-raised px-3 py-2.5 text-small text-danger"
        >
          {linkError}
        </p>
      ) : null}
      <LoginForm next={next} mode={mode} onModeChange={setMode} />
    </AuthShell>
  )
}
