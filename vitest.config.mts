import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite resolves the `@/*` alias from tsconfig natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    // core/ is pure TypeScript with no DOM dependency — node is the honest environment.
    environment: 'node',
    include: ['core/**/*.spec.ts'],
  },
})
