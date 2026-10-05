/**
 * Environment contract.
 *
 * Both values are `NEXT_PUBLIC_` and safe in the browser — RLS is what protects
 * the data, not the key. Referenced by their full literal names so Next can
 * statically inline them into the client bundle.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    )
  }
  return value
}

export const SUPABASE_URL = required(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_URL',
)

export const SUPABASE_ANON_KEY = required(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
)

/** Absolute origin for links sent by email (password reset). */
export function siteUrl(fallbackOrigin: string): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? fallbackOrigin
}
