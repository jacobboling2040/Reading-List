import { expect, test } from '@playwright/test';
import { createPasswordReset, createUser } from '../../src/lib/server/users';
import { adminId, createInviteToken, withE2eDb, ADMIN } from './seed';

const newInvite = () => withE2eDb(async (db) => createInviteToken(db, await adminId(db)));

let n = 0;
const uniq = () => `user${Date.now().toString(36)}${n++}`.slice(0, 20);

test('unauthenticated / redirects to /login', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?next=%2F$/);
	await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test('join with invite lands on /people, signed in', async ({ page }) => {
	const token = await newInvite();
	await page.goto(`/join/${token}`);
	await page.getByLabel('Username').fill(uniq());
	await page.getByLabel('Display name').fill('New Friend');
	await page.getByLabel('Password').fill('a-long-password-1');
	await page.getByRole('button', { name: 'Join' }).click();
	await expect(page).toHaveURL(/\/people$/);
	await expect(page.getByRole('navigation').getByRole('link', { name: 'Search' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('reusing invite shows expired message', async ({ page, browser }) => {
	const token = await newInvite();
	await page.goto(`/join/${token}`);
	await page.getByLabel('Username').fill(uniq());
	await page.getByLabel('Display name').fill('First');
	await page.getByLabel('Password').fill('a-long-password-1');
	await page.getByRole('button', { name: 'Join' }).click();
	await expect(page).toHaveURL(/\/people$/);
	const other = await browser.newPage();
	await other.goto(`/join/${token}`);
	await expect(other.getByText('This invite link has expired or was already used.')).toBeVisible();
	await other.close();
});

test('wrong password shows error', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByText('Wrong username or password.')).toBeVisible();
});

test('admin logs in over http, sees Admin link, logs out', async ({ page }) => {
	await page.goto('/login?next=%2Fpeople');
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/people$/);
	await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

for (const bad of [
	'https://evil.example',
	'//evil.example',
	'/\\evil.example',
	'/.//evil.example',
	'/\t/evil.example',
	'/\n/evil.example'
]) {
	test(`next=${JSON.stringify(bad)} is ignored`, async ({ page, baseURL }) => {
		await page.goto(`/login?next=${encodeURIComponent(bad)}`);
		await page.getByLabel('Username').fill(ADMIN.username);
		await page.getByLabel('Password').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Log in' }).click();
		await page.waitForURL((u) => !u.pathname.startsWith('/login'));
		expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
		expect(new URL(page.url()).pathname).toBe('/');
	});
}

test('GET /robots.txt disallows all', async ({ request }) => {
	const res = await request.get('/robots.txt');
	expect(await res.text()).toBe('User-agent: *\nDisallow: /');
});

test('responses have X-Robots-Tag', async ({ request }) => {
	for (const path of ['/robots.txt', '/login']) {
		const res = await request.get(path);
		expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
	}
});

test('reset link sets a new password; new works, old fails', async ({ page }) => {
	const username = uniq();
	const oldPassword = 'old-password-123';
	const newPassword = 'new-password-456';
	const token = await withE2eDb(async (db) => {
		const id = await createUser(db, { username, displayName: 'Resetter', password: oldPassword });
		return createPasswordReset(db, id);
	});
	await page.goto(`/reset/${token}`);
	await page.getByLabel('New password').fill(newPassword);
	await page.getByRole('button', { name: 'Set password' }).click();
	await expect(page).toHaveURL(/\/login\?notice=reset$/);
	await expect(page.getByText('Password updated.')).toBeVisible();

	await page.waitForLoadState('networkidle');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(oldPassword);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByText('Wrong username or password.')).toBeVisible();

	await page.getByLabel('Password').fill(newPassword);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/$/);
});
