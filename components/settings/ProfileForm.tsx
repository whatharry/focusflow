'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { updateProfile } from '@/server/actions/profile'

/**
 * A detected-timezone option is always offered, so the common case is one tap
 * rather than hunting through a list of several hundred IANA names.
 */
export function ProfileForm({
  displayName,
  timeZone,
  zones,
}: {
  displayName: string | null
  timeZone: string
  zones: readonly string[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  const options = Array.from(new Set([timeZone, detected, ...zones])).filter(Boolean).sort()

  return (
    <form
      action={(formData) => {
        setError(null)
        setSaved(false)
        startTransition(async () => {
          const result = await updateProfile(formData)
          if (result.error) setError(result.error)
          else setSaved(true)
        })
      }}
      className="mt-5 flex flex-col gap-5"
    >
      <TextInput
        id="settings-display-name"
        name="display_name"
        label="Display name"
        defaultValue={displayName ?? ''}
        maxLength={80}
        hint="Used in the greeting. Optional."
      />

      <Select
        id="settings-timezone"
        name="timezone"
        label="Timezone"
        defaultValue={timeZone}
        hint={
          detected && detected !== timeZone
            ? `This device looks like ${detected}.`
            : 'Decides where your day starts and ends.'
        }
      >
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </Select>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="text-small text-accent">
          Saved.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
