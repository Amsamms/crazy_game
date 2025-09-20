import { test, expect, Page } from '@playwright/test';

const startMenuSelector = '#startMenu';
const startButtonName = 'Enter the Surge';

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

test('loads and starts Chromatic Surge without errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chromatic Surge' })).toBeVisible();

  const startButton = page.getByRole('button', { name: startButtonName });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.locator(startMenuSelector)).toHaveAttribute('hidden', 'hidden');

  await page.waitForTimeout(1200);
  expect(errors, 'Console errors detected during gameplay').toHaveLength(0);

  const scoreText = await page.locator('#scoreValue').textContent();
  expect(scoreText).toBeTruthy();
});
