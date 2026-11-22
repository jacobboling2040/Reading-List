import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { addManualBook } from '../../src/lib/server/books';
import { saveReview } from '../../src/lib/server/reviews';
import { follow } from '../../src/lib/server/follows';
import { getShelfStatus } from '../../src/lib/server/shelves';
import { withE2eDb } from './seed';

const PASSWORD = 'reading-password-1';
let n = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${n++}`.slice(0, 20);

async function newMember(displayName: string) {
	const username = uniq('r');
	const id = await withE2eDb((db) => createUser(db, { username, displayName, password: PASSWORD }));
	return { id, username, displayName };
}

async function logIn(page: Page, username: string) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Log in' }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeEach(async ({ page }) => {
	// Keep tests hermetic: cover images would otherwise load from the real covers host.
	await page.route('https://covers.openlibrary.org/**', (route) => route.fulfill({ status: 404 }));
});

test('For You empty state prompts following people', async ({ page }) => {
	const me = await newMember('Loner');
	await logIn(page, me.username);
	await page.goto('/');
	await expect(page.getByText('Follow some friends to see what they loved.')).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: /people/i })).toHaveAttribute(
		'href',
		'/people'
	);
});

test(`friend's 5★ appears on follower's For You with "why" line; Not for me removes it`, async ({
	page
}) => {
	const friend = await newMember('Sam Friend');
	const me = await newMember('Follower');
	const [loved, liked] = await withE2eDb(async (db) => {
		await follow(db, me.id, friend.id);
		const a = await addManualBook(db, { title: uniq('Loved '), author: 'Susanna Clarke' }, friend.id);
		const b = await addManualBook(db, { title: uniq('Liked '), author: 'Ann Leckie' }, friend.id);
		await saveReview(db, friend.id, a, { rating: 5, body: 'Read it in two days.' });
		await saveReview(db, friend.id, b, { rating: 4 });
		const title = async (id: number) =>
			(await db.query.books.findFirst({ where: (t, { eq }) => eq(t.id, id) }))!.title;
		return [
			{ id: a, title: await title(a) },
			{ id: b, title: await title(b) }
		];
	});

	await logIn(page, me.username);
	await page.goto('/');
	const card = page.getByRole('article').filter({ hasText: loved.title });
	await expect(card).toBeVisible();
	await expect(card.getByText('Susanna Clarke')).toBeVisible();
	await expect(card.getByRole('link', { name: 'Sam Friend' })).toBeVisible();
	await expect(card.getByRole('img', { name: '5 stars' })).toBeVisible();
	await expect(card.getByText('Read it in two days.')).toBeVisible();

	await card.getByRole('button', { name: 'Not for me' }).click();
	await expect(card).toHaveCount(0);

	const other = page.getByRole('article').filter({ hasText: liked.title });
	await expect(other.getByRole('img', { name: '4 stars' })).toBeVisible();
	await other.getByRole('button', { name: 'To-read' }).click();
	await expect(other).toHaveCount(0);
	await expect(page.getByText('Nothing new from the people you follow yet.')).toBeVisible();
	expect(await withE2eDb((db) => getShelfStatus(db, me.id, liked.id))).toBe('to_read');
});
