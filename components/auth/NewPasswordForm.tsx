'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { updatePassword } from '@/server/actions/auth'

export function NewPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await updatePassword(formData)
          if (result?.error) setError(result.error)
        })
      }}
      className="flex flex-col gap-5"
    >
      <TextInput
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="At least 10 characters."
      />

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
