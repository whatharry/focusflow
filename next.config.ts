import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Development only, and only about the dev server's own assets.
   *
   * `next dev` refuses cross-origin requests for `/_next/*` from any hostname it
   * was not started with. The failure is quiet and misleading: HMR is blocked, the
   * client-side router never hydrates, and Server Action POSTs appear to do
   * nothing at all — a login form that just sits there. This happens the moment you
   * open the app at `127.0.0.1` instead of `localhost`, or at the Mac's LAN address
   * to install the PWA on a phone, which is the only way to test the real thing.
   *
   * `*` matches exactly one hostname label, so the private IPv4 ranges need one
   * entry each. `*.local` covers Bonjour names like `my-macbook.local`.
   */
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*', '172.16.*.*', '*.local'],
}

export default nextConfig
