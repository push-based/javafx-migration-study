import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * E2E flows for the weather migration (spec R11/R13/R15, AC9/AC11/AC13/AC15).
 *
 * The flows encode the user-visible behavior the JavaFX client guaranteed and
 * run against the real feature with the backend SSE seam reachable through the
 * proxy (`/weather/forecast` → :8080), so they need `backend/weather-service`
 * running. The AXE flow scans both views for WCAG 2.1 A and AA violations.
 */
test.describe('weather feature', () => {
  // --- AC13 (R13): deep-link + lazy load ------------------------------------
  test('deep-linking /weather renders the stream view', async ({ page }) => {
    await page.goto('/weather');
    await expect(
      page.getByRole('heading', { name: 'My Weather Forecast' }),
    ).toBeVisible();
  });

  // --- AC7 (R7): stream live-updates within ~3s -----------------------------
  test('the forecast region live-updates within ~3s (two SSE events @1.5s)', async ({
    page,
  }) => {
    await page.goto('/weather');
    const region = page.getByTestId('forecast');

    // First event populates the region.
    await expect(region).not.toHaveText('', { timeout: 3000 });
    const first = await region.textContent();

    // A later event replaces it (the 5 forecasts are random, so poll for any
    // change rather than asserting a specific second value).
    await expect
      .poll(async () => region.textContent(), { timeout: 5000 })
      .not.toBe(first);
  });

  // --- AC9 (R9) + AC11 (R11): nav to snapshot freezes the last value ---------
  test('navigating to /weather/latest shows the frozen last forecast', async ({
    page,
  }) => {
    await page.goto('/weather');
    const region = page.getByTestId('forecast');
    await expect(region).not.toHaveText('', { timeout: 3000 });
    const lastSeen = (await region.textContent())?.trim();

    await page.getByTestId('to-snapshot').click();
    await expect(page).toHaveURL(/\/weather\/latest$/);

    const snapshot = page.getByTestId('snapshot-forecast');
    await expect(snapshot).toHaveText(lastSeen ?? '');

    // Frozen: the snapshot value must not change over time.
    await page.waitForTimeout(3000);
    await expect(snapshot).toHaveText(lastSeen ?? '');
  });

  // --- AC11 (R11) + AC12 (R12): back resumes the live stream ----------------
  test('returning to the stream view resumes live updates', async ({ page }) => {
    await page.goto('/weather/latest');
    await page.getByTestId('to-stream').click();
    await expect(page).toHaveURL(/\/weather$/);

    const region = page.getByTestId('forecast');
    await expect(region).not.toHaveText('', { timeout: 3000 });
  });

  // --- AC15 (R15): AXE-clean on both views ----------------------------------
  test('stream and snapshot views are AXE-clean', async ({ page }) => {
    const scan = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations.map((v) => `${v.id}: ${v.help}`);

    await page.goto('/weather');
    await expect(page.getByTestId('forecast')).not.toHaveText('', {
      timeout: 3000,
    });
    expect(await scan()).toEqual([]);

    await page.getByTestId('to-snapshot').click();
    await expect(page).toHaveURL(/\/weather\/latest$/);
    expect(await scan()).toEqual([]);
  });
});
