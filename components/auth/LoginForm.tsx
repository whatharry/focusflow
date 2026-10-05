'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { signIn, signUp } from '@/server/actions/auth'

type Mode = 'signin' | 'signup'

/**
 * One form, two modes. A separate /signup route would be a second surface to
 * maintain for what is a single extra field.
 */
export function LoginForm({ next }: { next: string | undefined }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    // The server has no way to know the user's timezone; the browser does.
    formData.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
    startTransition(async () => {
      const action = mode === 'signin' ? signIn : signUp
      const result = await action(formData)
      // A successful action redirects, so reaching here means it failed.
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === 'signup' ? (
        <TextInput
          id="display_name"
          name="display_name"
          label="Your name"
          autoComplete="name"
          placeholder="Aswad"
          hint="Used for the greeting on Today. Optional."
        />
      ) : null}

      <TextInput
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder="you@example.com"
      />

      <TextInput
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        required
        minLength={mode === 'signup' ? 10 : undefined}
        hint={mode === 'signup' ? 'At least 10 characters.' : undefined}
      />

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
        {pending
          ? mode === 'signin'
            ? 'Signing in…'
            : 'Creating your account…'
          : mode === 'signin'
            ? 'Sign in'
            : 'Create account'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-small">
        <button
          type="button"
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
          onClick={() => {
            setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
            setError(null)
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>
        {mode === 'signin' ? (
          <a
            href="/reset"
            className="text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot password?
          </a>
        ) : null}
      </div>
    </form>
  )
}
