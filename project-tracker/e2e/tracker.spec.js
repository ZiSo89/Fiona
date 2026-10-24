import { test, expect } from '@playwright/test';

const monthPoints = (page) => page.locator('.calendar-panel .month-points');

async function loginAsEditor(page) {
  await page.locator('header').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await page.getByLabel('Κωδικός συνεργείου').fill('team-secret');
  await page.getByRole('dialog').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Αποσύνδεση', exact: true })).toBeVisible();
}

test('public view shows team points without editor tools', async ({ page }) => {
  await page.goto('/tracker/');
  await expect(page.getByRole('heading', { level: 1, name: 'Team One' })).toBeVisible();
  await expect(monthPoints(page)).toHaveAttribute('aria-label', '50 συνολικοί πόντοι');
  await expect(page.locator('header').getByRole('button', { name: 'Σύνδεση', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
});

test('theme toggle applies and remembers the charcoal dark theme', async ({ page }) => {
  await page.goto('/tracker/');

  await page.getByRole('button', { name: 'Ενεργοποίηση σκοτεινού θέματος' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('project-tracker-theme'))).toBe('dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 26, 31)');
  await expect(page.locator('.calendar-panel')).toHaveCSS('background-color', 'rgb(34, 39, 45)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Ενεργοποίηση φωτεινού θέματος' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('wrong editor password is rejected, then the editor corrects a pending job', async ({ page }) => {
  await page.goto('/tracker/');
  await page.locator('header').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await page.getByLabel('Κωδικός συνεργείου').fill('wrong');
  await page.getByRole('dialog').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid editor credentials');

  await page.getByLabel('Κωδικός συνεργείου').fill('team-secret');
  await page.getByRole('dialog').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Αποσύνδεση', exact: true })).toBeVisible();

  // The earliest job is the unmapped one and starts with open correction controls.
  const categorySelect = page.locator('.correction-controls select');
  await expect.poll(() => categorySelect.evaluate((select) => {
    const controls = select.closest('.correction-controls');
    return Math.round(select.getBoundingClientRect().width) === Math.round(controls.getBoundingClientRect().width);
  })).toBe(true);
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
  await expect(page.locator('header').getByRole('button', { name: 'Σύνδεση', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
});

test('admin can approve a month and team editors cannot edit it afterward', async ({ page }) => {
  await page.goto('/tracker/');
  await page.locator('header').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await page.getByLabel('Τύπος χρήστη').selectOption('admin');
  await page.getByLabel('Κωδικός admin').fill('admin-secret');
  await page.getByRole('dialog').getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Αποσύνδεση', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Έγκριση πληρωμής' }).click();
  await expect(page.getByText('Κλειδωμένο για πληρωμή')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ξεκλείδωμα' })).toBeVisible();

  await page.getByRole('button', { name: 'Αποσύνδεση', exact: true }).click();
  await loginAsEditor(page);
  await expect(page.getByText('Κλειδωμένο για πληρωμή')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Επεξεργασία πόντων/ })).toHaveCount(0);
});
