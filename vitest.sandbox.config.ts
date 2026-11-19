import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
// Standalone on purpose: the shared setup forces APP_ENV=test and the local test database,
// while sandbox checks must verify the real preview target they are given.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@payload-config': fileURLToPath(new URL('./payload.config.ts', import.meta.url)) } },
  test: { setupFiles: ['./tests/support/sandbox-env.ts'], include: ['tests/sandbox/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
})
