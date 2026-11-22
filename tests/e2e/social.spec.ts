import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { setShelf } from '../../src/lib/server/shelves';
import { addManualBook } from '../../src/lib/server/books';
import { withE2eDb } from './seed';

const PASSWORD = 'social-password-1';
let n = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${n++}`.slice(0, 20);

async function newMember(displayName: string) {
	const username = uniq('s');
	const id = await withE2eDb((db) => createUser(db, { username, displayName, password: PASSWORD }));
	return { id, username, displayName };
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

test('follow from People then profile shows Unfollow', async ({ page }) => {
	const me = await newMember('Me Social');
	const them = await newMember('Riley Reader');
	await logIn(page, me.username);
	await page.goto('/people');
	await page.waitForLoadState('networkidle');
	const row = page.locator(`li[data-username="${them.username}"]`);
	await row.getByRole('button', { name: 'Follow' }).click();
	await expect(row.getByRole('button', { name: 'Unfollow' })).toBeVisible();

	await page.goto(`/u/${them.username}`);
	await expect(page.getByRole('heading', { name: 'Riley Reader' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Unfollow' })).toBeVisible();
});

test('profile shows shelves and recent reviews, and no follower counts', async ({ page }) => {
	const me = await newMember('Viewer');
	const them = await newMember('Riley Shelf');
	await withE2eDb(async (db) => {
		const bookId = await addManualBook(db, { title: 'Profile Book', author: 'A. Writer' }, them.id);
		await setShelf(db, them.id, bookId, 'reading');
	});
	await logIn(page, me.username);
	await page.goto(`/u/${them.username}`);
	await expect(page.getByRole('heading', { name: 'Reading now' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Profile Book' })).toBeVisible();
	await expect(page.getByText('To-read (0)')).toBeVisible();
	await expect(page.getByText('Finished (0)')).toBeVisible();
	await expect(page.locator('body')).not.toContainText(/follower/i);
	expect((await page.request.get('/u/nobody_here')).status()).toBe(404);
});

test("friend's shelves are browsable from their profile", async ({ page }) => {
	const me = await newMember('Browser');
	const them = await newMember('Riley Shelves');
	await withE2eDb(async (db) => {
		const a = await addManualBook(db, { title: 'Queued Book', author: 'A. Writer' }, them.id);
		const b = await addManualBook(db, { title: 'Done Book', author: 'B. Writer' }, them.id);
		await setShelf(db, them.id, a, 'to_read');
		await setShelf(db, them.id, b, 'finished');
	});
	await logIn(page, me.username);
	await page.goto(`/u/${them.username}`);
	await page.getByRole('link', { name: 'To-read (1)' }).click();
	await expect(page).toHaveURL(/\?tab=to_read$/);
	await expect(page.getByRole('link', { name: 'Queued Book' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Done Book' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Finished (1)' }).click();
	await expect(page.getByRole('link', { name: 'Done Book' })).toBeVisible();
	await expect(page.locator('body')).not.toContainText(/follower/i);

	// An invalid tab is ignored: the default profile view shows.
	await page.goto(`/u/${them.username}?tab=bogus`);
	await expect(page.getByRole('heading', { name: 'Reading now' })).toBeVisible();
});

test('Profile nav link opens your own profile', async ({ page }) => {
	const me = await newMember('Self Viewer');
	await logIn(page, me.username);
	await page.getByRole('button', { name: 'Menu' }).click();
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Profile' })
		.click();
	await expect(page).toHaveURL(new RegExp(`/u/${me.username}$`));
	await expect(page.getByRole('heading', { name: 'Self Viewer' })).toBeVisible();
});

test('create and revoke invite', async ({ page }) => {
	const me = await newMember('Inviter');
	await logIn(page, me.username);
	await page.goto('/invite');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Create invite link' }).click();
	const link = page.locator('input[readonly]').first();
	await expect(link).toHaveValue(/\/join\/[\w-]+$/);
	await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
	const url = await link.inputValue();
	expect(url.startsWith('http://localhost:')).toBe(true);
	const token = url.split('/join/')[1];

	const pending = page.locator(`li[data-token="${token}"]`);
	await expect(pending).toBeVisible();
	await pending.getByRole('button', { name: 'Revoke' }).click();
	await expect(pending).toHaveCount(0);
	const res = await page.request.get(`/join/${token}`);
	expect(await res.text()).toMatch(/expired|already used|invalid/i);
});

test('change display name and password keeps this session', async ({ page, browser }) => {
	const me = await newMember('Old Name');
	const other = await browser.newPage();
	await logIn(other, me.username);
	await logIn(page, me.username);
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Display name').fill('New Name');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByText('Name saved.')).toBeVisible();

	await page.getByLabel('Current password').fill('wrong-password-xx');
	await page.getByLabel('New password').fill('another-password-2');
	await page.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('Your current password is not correct.')).toBeVisible();

	await page.getByLabel('Current password').fill(PASSWORD);
	await page.getByLabel('New password').fill('another-password-2');
	await page.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('Password changed.')).toBeVisible();

	await page.goto('/people');
	await expect(page).toHaveURL(/\/people$/);
	await other.goto('/people');
	await expect(other).toHaveURL(/\/login/);
	await other.close();
});

test('delete account signs out and username is free', async ({ page }) => {
	const me = await newMember('Leaver');
	await logIn(page, me.username);
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Type your username to confirm').fill('wrong');
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page.getByText(/must match your username/i)).toBeVisible();
	await page.getByLabel('Type your username to confirm').fill(me.username.toUpperCase());
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page).toHaveURL(/\/login/);
	await page.goto('/people');
	await expect(page).toHaveURL(/\/login/);
	await withE2eDb((db) =>
		createUser(db, { username: me.username, displayName: 'Again', password: PASSWORD })
	);
});
