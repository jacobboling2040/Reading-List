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
	await page.waitForLoadState('networkidle');
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

test('sidebar toggle cycles mode', async ({ page }) => {
	await signIn(page);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const html = page.locator('html');
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Theme: System' }).click();
	await expect(html).toHaveAttribute('data-theme', 'light');
	const toggle = page.getByRole('button', { name: 'Theme: Light' });
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(page.getByRole('button', { name: 'Theme: Dark' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('sidebar toggle keeps a scheme picked in settings', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	const html = page.locator('html');
	await page.getByLabel('Sage').check();
	await expect(html).toHaveAttribute('data-scheme', 'sage');
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Theme: System' }).click();
	await expect(html).toHaveAttribute('data-theme', 'light');
	await expect(html).toHaveAttribute('data-scheme', 'sage');
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'light');
	await expect(html).toHaveAttribute('data-scheme', 'sage');
});

test('settings picker follows the sidebar toggle', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	const html = page.locator('html');
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('button', { name: 'Theme: System' }).click();
	await page.getByRole('button', { name: 'Theme: Light' }).click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(page.getByLabel('Dark')).toBeChecked();
	await page.getByRole('button', { name: 'Close menu' }).click();
	await page.getByLabel('Sage').check();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(html).toHaveAttribute('data-scheme', 'sage');
});
