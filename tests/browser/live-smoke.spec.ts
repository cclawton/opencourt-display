import { test, expect } from '@playwright/test';

test('live CloudFront page loads configured sign-in without committee access', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.context().route('**/*', (route) => {
    const req = route.request();
    if (
      new URL(req.url()).pathname.startsWith('/admin/') ||
      !['GET', 'HEAD'].includes(req.method())
    )
      return route.abort();
    return route.continue();
  });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByText('Sign in with the club Google account to control the TVs.'),
  ).toBeVisible();
  await expect(
    page.getByLabel('Sign in with Google', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Control room sections')).toHaveCount(0);
  const config = await page.evaluate(() => window.OPENCOURT_WEB_CONFIG);
  expect(config?.apiBaseUrl).toMatch(/^https:\/\//);
  expect(config?.googleClientId).toMatch(/\.apps\.googleusercontent\.com$/);
  expect(config?.deviceId).toBe('honours-board-tv');
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
