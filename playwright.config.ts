import { defineConfig, devices } from '@playwright/test';

const local = process.env.BROWSER_TEST_LOCAL === '1';
const baseURL = local ? 'http://127.0.0.1:4173' : process.env.CONTROL_ROOM_URL;
if (!baseURL || (!local && !baseURL.startsWith('https://'))) {
  throw new Error(
    'Set CONTROL_ROOM_URL to the deployed HTTPS control-room URL.',
  );
}

export default defineConfig({
  webServer: local
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: false,
      }
    : undefined,
  testIgnore: local ? '**/live-smoke.spec.ts' : undefined,
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
