import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { ADMIN, withE2eDb } from './seed';

let n = 0;
const uniq = () => `adm${Date.now().toString(36)}${n++}`.slice(0, 20);
const PASSWORD = 'member-password-1';

const newMember = (username: string) =>
	withE2eDb((db) =>
		createUser(db, {
			username,
			displayName: `Member ${username}`,
			password: PASSWORD
		})
	);

async function login(page: Page, username: string, password: string) {
	await page.goto('/login?next=%2Fpeople');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/people$/);
}

test('non-admin gets 404 on /admin and /admin/backup', async ({ page }) => {
	const username = uniq();
	await newMember(username);
	await login(page, username, PASSWORD);
	expect((await page.request.get('/admin')).status()).toBe(404);
	expect((await page.request.get('/admin/backup')).status()).toBe(404);
});

test('admin downloads a backup', async ({ page }) => {
	await login(page, ADMIN.username, ADMIN.password);
	const res = await page.request.get('/admin/backup');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-disposition']).toMatch(
		/^attachment; filename="reading-list-\d{4}-\d{2}-\d{2}\.sql"$/
	);
	expect(res.headers()['cache-control']).toBe('no-store');
	const body = await res.text();
	expect(body).toContain('CREATE TABLE');
	expect(body).not.toMatch(/INSERT INTO "sessions"/);
});

test('deactivate signs that member out', async ({ page, browser }) => {
	const username = uniq();
	await newMember(username);
	const memberPage = await browser.newPage();
	await login(memberPage, username, PASSWORD);

	await login(page, ADMIN.username, ADMIN.password);
	await page.goto('/admin');
	await page.waitForLoadState('networkidle');
	const row = page.locator(`tr[data-username="${username}"]`);
	await row.getByRole('button', { name: 'Deactivate' }).click();
	await expect(row.getByText('Deactivated')).toBeVisible();

	await memberPage.goto('/people');
	await expect(memberPage).toHaveURL(/\/login/);
	await memberPage.close();
});

test('admin cannot deactivate themselves', async ({ page }) => {
	await login(page, ADMIN.username, ADMIN.password);
	await page.goto('/admin');
	await page.waitForLoadState('networkidle');
	await page
		.locator(`tr[data-username="${ADMIN.username}"]`)
		.getByRole('button', { name: 'Deactivate' })
		.click();
	await expect(page.getByText("You can't deactivate yourself.")).toBeVisible();
});

test('reset link lets member set new password', async ({ page, browser }) => {
	const username = uniq();
	await newMember(username);
	await login(page, ADMIN.username, ADMIN.password);
	await page.goto('/admin');
	await page.waitForLoadState('networkidle');
	const row = page.locator(`tr[data-username="${username}"]`);
	await row.getByRole('button', { name: 'Create reset link' }).click();
	const link = (await row.locator('.reset-link').textContent())!.trim();
	expect(link).toMatch(/\/reset\/[\w-]+$/);

	const memberPage = await browser.newPage();
	await memberPage.goto(link);
	await memberPage.waitForLoadState('networkidle');
	await memberPage.getByLabel('New password').fill('brand-new-password-9');
	await memberPage.getByRole('button', { name: 'Set password' }).click();
	await expect(memberPage).toHaveURL(/\/login\?notice=reset$/);
	await memberPage.waitForLoadState('networkidle');
	await memberPage.getByLabel('Username').fill(username);
	await memberPage.getByLabel('Password').fill('brand-new-password-9');
	await memberPage.getByRole('button', { name: 'Log in' }).click();
	await expect(memberPage).not.toHaveURL(/\/login/);
	await memberPage.close();
});
