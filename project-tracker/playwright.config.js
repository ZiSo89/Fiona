import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '4100';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.js',
  workers: 1,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
  },
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `http://127.0.0.1:${port}/tracker/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: port },
  },
});
