import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from './seed';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).not.toHaveURL(/login/);
}

test('theme choice applies immediately and survives reload', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings');
	const html = page.locator('html');
	await page.getByLabel('Dark').check();
	await page.getByLabel('Sage').check();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(html).toHaveAttribute('data-scheme', 'sage');
	await expect(page).toHaveURL(/\/settings$/);
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(html).toHaveAttribute('data-scheme', 'sage');
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('theme works without JavaScript', async ({ page }) => {
		await signIn(page);
		await page.goto('/settings');
		await page.getByLabel('Light').check();
		await page.getByLabel('Plum').check();
		await page.getByRole('button', { name: 'Save appearance' }).click();
		await expect(page.locator('html[data-theme="light"][data-scheme="plum"]')).toHaveCount(1);
	});
});
