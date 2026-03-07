import { expect, test } from '@playwright/test';

const locale = process.env.E2E_BASE_LOCALE ?? 'en';
const email = process.env.E2E_CLERK_TEST_EMAIL;
const password = process.env.E2E_CLERK_TEST_PASSWORD;
const hasRequiredEnv = Boolean(
  email
  && password
  && process.env.MISTRAL_API_KEY
  && process.env.PINECONE_API_KEY,
);

test.describe('Dashboard flow', () => {
  test('completes upload, generation, submission, and progress review', async ({ page }) => {
    test.skip(!hasRequiredEnv, 'Requires Clerk test credentials plus Mistral and Pinecone configuration');

    const documentTitle = `Phase 5 text ${Date.now()}`;
    const textContent = [
      'Il passato prossimo descrive azioni concluse nel passato.',
      'Gli studenti usano questo tempo per raccontare cosa hanno fatto ieri.',
      'Questo testo e abbastanza lungo da superare la soglia minima di importazione.',
    ].join(' ');

    await page.goto(`/${locale}/sign-in`);
    await page.getByLabel(/email/i).fill(String(email));
    await page.getByLabel(/password/i).fill(String(password));
    await page.getByRole('button', { name: /sign in|continue/i }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard/?$`));

    await page.goto(`/${locale}/dashboard/content`);
    await page.getByRole('button', { name: 'Text' }).click();
    await page.getByLabel('Title').fill(documentTitle);
    await page.getByLabel('Paste text').fill(textContent);
    await page.getByRole('button', { name: 'Upload document' }).click();

    await expect(page.getByText(documentTitle)).toBeVisible();
    await expect
      .poll(async () => {
        const card = page.getByText(documentTitle).locator('..').locator('..');
        return await card.getByText(/Ready|Failed/).textContent();
      }, { timeout: 60_000 })
      .toContain('Ready');

    await page.goto(`/${locale}/dashboard/exercises`);
    await page.getByLabel(new RegExp(documentTitle)).check();
    await page.getByLabel('Exercise type').selectOption('single_answer');
    await page.getByRole('button', { name: 'Generate exercises' }).click();

    await expect
      .poll(async () => await page.getByText('Generated exercises').isVisible(), { timeout: 60_000 })
      .toBe(true);

    await page.getByLabel('Your answer').first().fill('Si usa per parlare di un azione finita nel passato.');
    await page.getByRole('button', { name: 'Submit answer' }).first().click();

    await expect(page.getByText('Latest feedback')).toBeVisible({ timeout: 60_000 });

    await page.goto(`/${locale}/dashboard/progress`);

    await expect(page.getByText('Recent attempts')).toBeVisible();
    await expect(page.getByText(documentTitle)).toBeVisible();
  });
});
