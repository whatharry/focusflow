'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { requestPasswordReset } from '@/server/actions/auth'

export function ResetRequestForm() {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">
          If that address has an account, a reset link is on its way. The link opens
          FocusFlow and lets you set a new password.
        </p>
        <a className="text-small text-muted underline-offset-4 hover:text-ink hover:underline" href="/login">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <form
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await requestPasswordReset(formData)
          if (result.error) setError(result.error)
          else setSent(true)
        })
      }}
      className="flex flex-col gap-5"
    >
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

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>

      <a className="text-small text-muted underline-offset-4 hover:text-ink hover:underline" href="/login">
        Back to sign in
      </a>
    </form>
  )
}
