import type { MetadataRoute } from 'next'

/**
 * Installability, which Phase 1 needs for one specific reason: on iOS, an app added
 * to the home screen runs without Safari's chrome, and Focus Mode without a URL bar
 * is a materially different experience from Focus Mode with one.
 *
 * This is not offline support. There is no service worker yet — that is Phase 7.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FocusFlow',
    short_name: 'FocusFlow',
    description: 'Show up, start one task, and make real progress.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0c0e',
    theme_color: '#0b0c0e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
