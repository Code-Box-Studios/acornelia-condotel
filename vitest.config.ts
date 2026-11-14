import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@payload-config': fileURLToPath(new URL('./payload.config.ts', import.meta.url)) } },
  test: { setupFiles: ['./tests/support/env.ts'], include: ['tests/{unit,integration,contract}/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
})
