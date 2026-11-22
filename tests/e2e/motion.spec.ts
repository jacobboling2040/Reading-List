import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { withE2eDb } from './seed';

const PASSWORD = 'reading-password-1';
let n = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${n++}`.slice(0, 20);

async function newMember(displayName: string) {
	const username = uniq('m');
	await withE2eDb((db) => createUser(db, { username, displayName, password: PASSWORD }));
	return { username };
}

async function logIn(page: Page, username: string) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Log in' }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test('buttons visibly react to a press', async ({ page }) => {
	const me = await newMember('Presser');
	await logIn(page, me.username);
	await page.goto('/settings');
	const button = page.getByRole('button', { name: 'Save name' });
	await button.hover();
	await page.mouse.down();
	await expect
		.poll(() => button.evaluate((el) => getComputedStyle(el).transform))
		.not.toBe('none');
	await page.mouse.up();
});

test('reduced motion turns transitions off', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/login');
	const duration = await page
		.getByRole('button', { name: 'Log in' })
		.evaluate((el) => getComputedStyle(el).transitionDuration);
	expect(duration).toBe('0s');
});
