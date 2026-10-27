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
  await expect(monthPoints(page)).toHaveAttribute('aria-label', '100 συνολικοί πόντοι');
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

test('calendar cells share one color that contrasts with the page background', async ({ page }) => {
  await page.goto('/tracker/');

  const colors = await page.locator('.calendar-weeks .calendar-day, .calendar-weeks .calendar-empty').evaluateAll((cells) => (
    cells.map((cell) => getComputedStyle(cell).backgroundColor)
  ));
  expect(new Set(colors).size).toBe(1);
  const pageBackground = await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(colors[0]).not.toBe(pageBackground);
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

  // The earliest job is the unmapped one and starts with the category picker open.
  await expect(page.locator('.correction-controls .category-picker')).toBeVisible();
  const save = page.getByRole('button', { name: 'Αποθήκευση' });
  await expect(save).toBeDisabled();
  await page.locator('.category-option', { hasText: 'Άλλες εργασίες' }).click();
  await expect(page.locator('.correction-controls .category-picker')).toBeVisible();
  await expect(monthPoints(page)).toHaveAttribute('aria-label', '105 συνολικοί πόντοι');
  await expect(page.locator('.job-points', { hasText: '+5 pts' })).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(monthPoints(page)).toHaveAttribute('aria-label', '105 συνολικοί πόντοι');
  await expect(page.locator('.job-points', { hasText: '+5 pts' })).toBeVisible();
  await expect(page.locator('.correction-controls .category-picker')).toHaveCount(0);
});

test('reselecting cabling resets the live points to 15 and leaves the picker open until save', async ({ page }) => {
  await page.goto('/tracker/');
  await loginAsEditor(page);

  await page.locator('.day-filters').getByRole('button', { name: /Cabling repair and maintenance/ }).click();
  const cablingJob = page.locator('.job-row').filter({ hasText: 'Cabling repair and maintenance' });
  const monthTotalBefore = Number(await monthPoints(page).locator('strong').textContent());
  await cablingJob.getByRole('button', { name: 'Αλλαγή' }).click();

  await expect(cablingJob.locator('.job-points')).toHaveText('+50 pts');
  await cablingJob.locator('.category-option', { hasText: 'Καλωδίωση / νέα εγκατάσταση' }).click();
  const pointChoices = cablingJob.locator('.category-point-choices');
  await expect(pointChoices).toBeVisible();
  await pointChoices.getByRole('button', { name: '50', exact: true }).click();
  await expect(cablingJob.locator('.job-points')).toHaveText('+50 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore} συνολικοί πόντοι`);
  await pointChoices.getByRole('button', { name: '15', exact: true }).click();
  await expect(cablingJob.locator('.job-points')).toHaveText('+15 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore - 35} συνολικοί πόντοι`);
  await expect(cablingJob.locator('.category-picker')).toBeVisible();
  await expect(cablingJob.getByRole('button', { name: 'Αποθήκευση' })).toBeEnabled();

  await cablingJob.getByRole('button', { name: 'Αποθήκευση' }).click();
  await expect(cablingJob.locator('.job-points')).toHaveText('+15 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore - 35} συνολικοί πόντοι`);
  await expect(cablingJob.locator('.category-picker')).toHaveCount(0);
});

test('editor can manually choose 15 points for optical installation', async ({ page }) => {
  await page.goto('/tracker/');
  await loginAsEditor(page);

  await page.locator('.day-filters').getByRole('button', { name: /FTTH Installation/ }).click();
  const opticalJob = page.locator('.job-row').filter({ hasText: 'FTTH Installation' });
  const monthTotalBefore = Number(await monthPoints(page).locator('strong').textContent());
  await opticalJob.getByRole('button', { name: 'Αλλαγή' }).click();
  await opticalJob.locator('.category-option', { hasText: 'Εγκατάσταση Οπτικής' }).click();

  const pointChoices = opticalJob.locator('.category-point-choices');
  await expect(pointChoices).toBeVisible();
  await pointChoices.getByRole('button', { name: '50', exact: true }).click();
  await expect(opticalJob.locator('.job-points')).toHaveText('+50 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore} συνολικοί πόντοι`);
  await pointChoices.getByRole('button', { name: '15', exact: true }).click();
  await expect(opticalJob.locator('.job-points')).toHaveText('+15 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore - 35} συνολικοί πόντοι`);
  await expect(opticalJob.getByRole('button', { name: 'Αποθήκευση' })).toBeEnabled();

  await opticalJob.getByRole('button', { name: 'Αποθήκευση' }).click();
  await expect(opticalJob.locator('.job-points')).toHaveText('+15 pts');
  await expect(monthPoints(page)).toHaveAttribute('aria-label', `${monthTotalBefore - 35} συνολικοί πόντοι`);
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
