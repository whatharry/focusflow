export type AuthMode = 'signin' | 'signup'

/**
 * The heading is part of the mode, not decoration around it. Telling a brand new
 * user "Welcome back" is a small lie that makes the product feel careless.
 */
export const AUTH_COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: {
    title: 'Welcome back',
    subtitle: 'Sign in to pick up where you left off.',
  },
  signup: {
    title: 'Start focusing',
    subtitle: 'One account, then straight into your first session.',
  },
}
