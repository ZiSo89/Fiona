import { test, expect } from '@playwright/test';

const monthPoints = (page) => page.locator('.calendar-panel .month-points');

async function loginAsEditor(page) {
  await page.getByRole('button', { name: 'Σύνδεση επεξεργασίας' }).click();
  await page.getByLabel('Κωδικός συνεργείου').fill('team-secret');
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Επεξεργασία', exact: true })).toBeVisible();
}

test('public view shows team points without editor tools', async ({ page }) => {
  await page.goto('/tracker/');
  await expect(page.getByRole('heading', { level: 1, name: 'Team One' })).toBeVisible();
  await expect(monthPoints(page)).toHaveAttribute('aria-label', '50 συνολικοί πόντοι');
  await expect(page.getByRole('button', { name: 'Σύνδεση επεξεργασίας' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
});

test('wrong editor password is rejected, then the editor corrects a pending job', async ({ page }) => {
  await page.goto('/tracker/');
  await page.getByRole('button', { name: 'Σύνδεση επεξεργασίας' }).click();
  await page.getByLabel('Κωδικός συνεργείου').fill('wrong');
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid editor credentials');

  await page.getByLabel('Κωδικός συνεργείου').fill('team-secret');
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Επεξεργασία', exact: true })).toBeVisible();

  // The earliest job is the unmapped one and starts with open correction controls.
  const save = page.getByRole('button', { name: 'Αποθήκευση' });
  await expect(save).toBeDisabled();
  await page.locator('.correction-controls select').selectOption('copper_installation');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(monthPoints(page)).toHaveAttribute('aria-label', '65 συνολικοί πόντοι');
  await expect(page.locator('.job-points', { hasText: '+15 pts' })).toBeVisible();
});

test('editor session is scoped to its own team profile', async ({ page }) => {
  await page.goto('/tracker/');
  await loginAsEditor(page);

  await page.getByLabel('Επιλογή συνεργείου').selectOption('komotini::Team Two');
  await expect(page.getByRole('heading', { level: 1, name: 'Team Two' })).toBeVisible();
  await expect(monthPoints(page)).toHaveAttribute('aria-label', '18 συνολικοί πόντοι');
  await expect(page.getByRole('button', { name: 'Σύνδεση επεξεργασίας' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
});
