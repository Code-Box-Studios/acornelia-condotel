import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers:1,
  webServer:{command:'pnpm exec tsx scripts/e2e-server.ts',url:'http://127.0.0.1:3043',reuseExistingServer:false,timeout:120000,stdout:'pipe',stderr:'pipe'},
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3043', trace: 'retain-on-failure' },
  projects: [{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
})
