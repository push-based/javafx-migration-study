import { expect, test } from '@playwright/test';

/**
 * E2E flows for the Music CRUD migration (spec R6, R12–R14, R20, R22 / AC6,
 * AC12–AC14, AC20, AC22). Both JavaFX clients collapse onto this one feature.
 *
 * Backend: these run against **rest-h2** on :8080 (OD-1) — in-memory, auto-seeded
 * with 8 categories, zero setup — reached through the dev proxy
 * (`/musiccategories` → :8080). The AXE flow stays a `test.fixme` skeleton
 * because `@axe-core/playwright` isn't installed.
 *
 * Shared-backend robustness (D5): `playwright.config.mts` runs THREE projects
 * (chromium/firefox/webkit) in parallel against the SAME non-reset rest-h2
 * :8080. So the specs must tolerate residue and not collide:
 *   - assert the seeded category NAMES are present (not an absolute row count) —
 *     other projects' in-flight create/delete rows perturb the count;
 *   - every cell locator is `{ exact: true }` — `getByRole('cell',{name})`
 *     substring-matches, so `E2E x` would also match `E2E x-ed`;
 *   - created names carry per-project + per-worker entropy (`uniqueName`) so the
 *     three projects never create the same row, and each test deletes what it
 *     created.
 */

/** The 8 categories rest-h2 seeds (data.sql) — always present regardless of residue. */
const SEEDED = [
  'Classical',
  'Rock',
  'Jazz',
  'Rap',
  'Country',
  'Musical Theatre',
  'Blues',
  'Alternative',
];

/**
 * A name unique across parallel Playwright projects/workers AND short enough for
 * the seam's `MusicCategory varchar(20)` column (rest-h2 schema.sql) — even after
 * the `-ed` update suffix below. Composition: project initial + worker index +
 * base36 ms-clock tail keeps the whole base to ~11 chars (renamed ~14).
 */
function uniqueName(): string {
  const project = test.info().project.name[0]; // c | f | w
  const worker = test.info().workerIndex;
  const clock = Date.now().toString(36).slice(-5);
  return `E2E ${project}${worker}${clock}`;
}

test.describe('music feature', () => {
  // --- AC20 (R20): deep-link + lazy load ------------------------------------
  test('deep-linking /music renders the Music Categories view', async ({
    page,
  }) => {
    await page.goto('/music');
    await expect(
      page.getByRole('heading', { name: 'Music Categories' }),
    ).toBeVisible();
  });

  // --- AC10 (R10): list renders the seeded categories -----------------------
  test('the table renders the seeded categories', async ({ page }) => {
    await page.goto('/music');
    // Residue-tolerant: assert each seeded name is present (exact match) rather
    // than an absolute row count — parallel projects may add/remove rows (D5).
    for (const name of SEEDED) {
      await expect(
        page.getByRole('cell', { name, exact: true }),
      ).toBeVisible();
    }
  });

  // --- AC6 (R6): New disabled until the field is non-empty -------------------
  test('New is disabled when the field is empty', async ({ page }) => {
    await page.goto('/music');
    await expect(page.getByTestId('create')).toBeDisabled();

    await page.getByTestId('category-name').fill('Funk');
    await expect(page.getByTestId('create')).toBeEnabled();
  });

  // --- AC12–AC14 (R12–R14): create → edit → delete round-trip ---------------
  test('create → edit → delete round-trip against rest-h2', async ({
    page,
  }) => {
    await page.goto('/music');
    // Per-project + per-worker unique name (D5), and short enough for the seam's
    // varchar(20) column even after the `-ed` suffix below (see uniqueName).
    const name = uniqueName();

    // CREATE: type a new name, New becomes enabled, submit → row appears.
    // Exact cell match (D5): a substring locator would also match `${name}-ed`.
    await page.getByTestId('category-name').fill(name);
    await page.getByTestId('create').click();
    await expect(
      page.getByRole('cell', { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('status')).toContainText(`${name} created`);

    // EDIT: select the row (copies name), change it, Update → renamed row.
    const renamed = `${name}-ed`;
    await page.getByRole('cell', { name, exact: true }).click();
    await page.getByTestId('category-name').fill(renamed);
    await page.getByTestId('update').click();
    await expect(
      page.getByRole('cell', { name: renamed, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('status')).toContainText(`${renamed} updated`);

    // DELETE: select the renamed row, Delete → row gone (cleans up what we made).
    await page.getByRole('cell', { name: renamed, exact: true }).click();
    await page.getByTestId('delete').click();
    await expect(
      page.getByRole('cell', { name: renamed, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId('status')).toContainText(`${renamed} deleted`);
  });

  // --- AC22 (R22): AXE-clean ------------------------------------------------
  test.fixme('the music view is AXE-clean', async () => {
    // Not automated: needs @axe-core/playwright to assert zero violations on /music.
    expect(true).toBe(true);
  });
});
