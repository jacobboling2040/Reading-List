import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { ADMIN, withE2eDb } from './seed';

const PASSWORD = 'nav-password-1';
let n = 0;

async function newMember() {
	const username = `nav${Date.now().toString(36)}${n++}`.slice(0, 20);
	await withE2eDb((db) => createUser(db, { username, displayName: 'Nav Member', password: PASSWORD }));
	return username;
}

async function logIn(page: Page, username: string, password = PASSWORD) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeEach(async ({ page }) => {
	await page.route('https://covers.openlibrary.org/**', (route) => route.fulfill({ status: 404 }));
});

test('sidebar opens, traps focus, closes on Escape', async ({ page }) => {
	await logIn(page, await newMember());
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const sidebar = page.getByRole('navigation', { name: 'Main' });
	await expect(sidebar).toBeHidden();
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(sidebar).toBeVisible();
	await expect(sidebar.locator(':focus')).toHaveCount(1);
	for (let i = 0; i < 10; i++) {
		await page.keyboard.press('Tab');
		await expect(sidebar.locator(':focus')).toHaveCount(1);
	}
	await page.keyboard.press('Escape');
	await expect(sidebar).toBeHidden();
	await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
});

test('sidebar link navigates and closes the sidebar', async ({ page }) => {
	await logIn(page, await newMember());
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shelves' }).click();
	await expect(page).toHaveURL(/\/shelves$/);
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('sidebar works without JavaScript', async ({ page }) => {
		await logIn(page, await newMember());
		await page.goto('/');
		await page.getByRole('button', { name: 'Menu' }).click();
		const shelves = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shelves' });
		await expect(shelves).toBeVisible();
		await shelves.click();
		await expect(page).toHaveURL(/\/shelves$/);
	});
});

test('log out, invite and admin live in Settings', async ({ page }) => {
	await logIn(page, await newMember());
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Menu' }).click();
	const sidebar = page.getByRole('navigation', { name: 'Main' });
	for (const name of ['Invite', 'Admin', 'Log out']) {
		await expect(sidebar.getByRole('link', { name })).toHaveCount(0);
		await expect(sidebar.getByRole('button', { name })).toHaveCount(0);
	}
	await page.goto('/settings');
	await expect(page.getByRole('link', { name: 'Invite a friend' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('Settings shows Admin for the admin', async ({ page }) => {
	await logIn(page, ADMIN.username, ADMIN.password);
	await page.goto('/settings');
	await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
});

test('a Menu tap before hydration keeps the sidebar open', async ({ page }) => {
	await logIn(page, await newMember());
	await page.goto('/', { waitUntil: 'commit' });
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
});
