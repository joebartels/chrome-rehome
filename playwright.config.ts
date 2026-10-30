import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    ...(process.platform === 'darwin' ? [{ name: 'native-macos', grep: /@native-macos/ }] : []),
    { name: 'portable', grepInvert: /@headed|@native-macos/ },
    { name: 'headed', grep: /@headed/, grepInvert: /@native-macos/ },
  ],
});
