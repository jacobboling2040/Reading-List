import { expect, test, type Page } from '@playwright/test';
import { createUser } from '../../src/lib/server/users';
import { addManualBook } from '../../src/lib/server/books';
import { saveReview } from '../../src/lib/server/reviews';
import { follow } from '../../src/lib/server/follows';
import { getShelfStatus, setShelf } from '../../src/lib/server/shelves';
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

test('adding from search shelves the book and stays on search', async ({ page }) => {
	const me = await newMember('Searcher');
	await logIn(page, me.username);
	await page.goto('/search');
	await page.waitForLoadState('networkidle');
	await page.getByRole('searchbox', { name: 'Find a book' }).fill('earthsea');
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page).toHaveURL(/\/search\?q=earthsea$/);
	await page.waitForLoadState('networkidle');
	const result = page.getByRole('listitem').filter({ hasText: 'A Wizard of Earthsea' });
	await expect(result.getByText('Ursula K. Le Guin')).toBeVisible();
	await result.getByLabel('Shelf for A Wizard of Earthsea').selectOption({ label: 'Reading' });
	await result.getByRole('button', { name: 'Add A Wizard of Earthsea' }).click();
	await expect(result.getByText('Added to Reading')).toBeVisible();
	await expect(page).toHaveURL(/\/search\?q=earthsea$/);
	await result.getByRole('link', { name: 'View book' }).click();
	await expect(page).toHaveURL(/\/books\/\d+$/);
	await expect(page.getByRole('heading', { level: 1, name: 'A Wizard of Earthsea' })).toBeVisible();
	await expect(page.getByText('1968')).toBeVisible();
	await expect(page.getByText('No reviews yet.')).toBeVisible();
	await page.goto('/search?q=earthsea');
	await expect(result.getByText('On your Reading shelf')).toBeVisible();
});

test('search updates as you type', async ({ page }) => {
	const me = await newMember('Typer');
	await logIn(page, me.username);
	await page.goto('/search');
	await page.waitForLoadState('networkidle');
	const box = page.getByRole('searchbox', { name: 'Find a book' });
	await box.pressSequentially('earthsea');
	await expect(page.getByRole('heading', { name: 'A Wizard of Earthsea' })).toBeVisible({ timeout: 3000 });
	await expect(page).toHaveURL(/\/search\?q=earthsea$/);
	await expect(box).toBeFocused();
});

test('stale search responses never replace newer results', async ({ page }) => {
	const me = await newMember('Stale');
	await logIn(page, me.username);
	await page.goto('/search');
	await page.waitForLoadState('networkidle');
	let release!: () => void;
	const released = new Promise<void>((r) => (release = r));
	await page.route('**/search/__data.json?*q=outage*', async (route) => {
		await released;
		await route.continue().catch(() => {});
	});
	const box = page.getByRole('searchbox', { name: 'Find a book' });
	await box.pressSequentially('outage');
	await page.waitForTimeout(400);
	await box.fill('');
	await box.pressSequentially('earthsea');
	await expect(page.getByRole('heading', { name: 'A Wizard of Earthsea' })).toBeVisible();
	release();
	await page.waitForTimeout(500);
	await expect(page.getByRole('heading', { name: 'A Wizard of Earthsea' })).toBeVisible();
	await expect(page.getByRole('alert').filter({ hasText: 'unavailable' })).toHaveCount(0);
	await expect(box).toHaveValue('earthsea');
	await expect(page).toHaveURL(/q=earthsea$/);
});

test('search outage shows manual-add message', async ({ page }) => {
	const me = await newMember('Outage');
	await logIn(page, me.username);
	await page.goto('/search?q=outage');
	await expect(
		page.getByText('Book search is unavailable right now. You can add it manually.')
	).toBeVisible();
	const title = uniq('Handmade ');
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByLabel('Author', { exact: true }).fill('Some Author');
	await page.getByRole('button', { name: 'Add book' }).click();
	await expect(page).toHaveURL(/\/books\/\d+$/);
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(page.getByText('Some Author')).toBeVisible();
});

test('book page: non-numeric or missing id is 404', async ({ page }) => {
	const me = await newMember('Lost');
	await logIn(page, me.username);
	expect((await page.goto('/books/abc'))?.status()).toBe(404);
	expect((await page.goto('/books/999999'))?.status()).toBe(404);
});

test('mark finished prompts review; save review shows on book page', async ({ page }) => {
	const me = await newMember('Finisher');
	const critic = await newMember('Critic Cat');
	const saver = await newMember('Saver Sue');
	const title = uniq('Finish ');
	const bookId = await withE2eDb(async (db) => {
		const id = await addManualBook(db, { title, author: 'Ann Author' }, critic.id);
		await saveReview(db, critic.id, id, { rating: 2, body: 'Not my thing.' });
		await setShelf(db, saver.id, id, 'to_read');
		return id;
	});

	await logIn(page, me.username);
	await page.goto(`/books/${bookId}`);
	await expect(page.getByText('On to-read:')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Saver Sue' })).toBeVisible();
	await expect(page.getByText('1 reviewer')).toBeVisible();

	await page.getByRole('button', { name: 'Finished' }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${bookId}\\?review=1$`));
	await expect(page.getByRole('button', { name: 'Finished' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const reviewForm = page.getByRole('form', { name: 'Your review' });
	await expect(reviewForm.getByRole('radio').first()).toBeFocused();
	await expect(page.getByRole('link', { name: 'Skip' })).toHaveAttribute('href', `/books/${bookId}`);

	await reviewForm.getByRole('radio', { name: '4 stars' }).check();
	await reviewForm.getByLabel('Your review (optional)').fill('Loved the ending.');
	await reviewForm.getByRole('button', { name: 'Save review' }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${bookId}$`));
	const mine = page.getByRole('listitem').filter({ hasText: 'Finisher' });
	await expect(mine.getByText('Loved the ending.')).toBeVisible();
	await expect(mine.getByRole('img', { name: '4 stars' })).toBeVisible();
	await expect(page.getByText('3.0')).toBeVisible();
	await expect(page.getByText('2 reviewers')).toBeVisible();

	// Edit, then delete.
	await reviewForm.getByRole('radio', { name: '5 stars' }).check();
	await reviewForm.getByRole('button', { name: 'Save review' }).click();
	await expect(mine.getByRole('img', { name: '5 stars' })).toBeVisible();
	await expect(page.getByText('3.5')).toBeVisible();
	await page.getByRole('button', { name: 'Delete review' }).click();
	await expect(mine).toHaveCount(0);
	await expect(page.getByText('1 reviewer')).toBeVisible();

	await page.getByRole('button', { name: 'Remove from shelves' }).click();
	await expect(page.getByRole('button', { name: 'Finished' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	expect(await withE2eDb((db) => getShelfStatus(db, me.id, bookId))).toBeNull();
});

test('search, add, shelve as to-read appears on shelves', async ({ page }) => {
	const me = await newMember('Shelver');
	await logIn(page, me.username);
	await page.goto('/search?q=le+guin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Shelf for The Left Hand of Darkness').selectOption({ label: 'To-read' });
	await page.getByRole('button', { name: 'Add The Left Hand of Darkness' }).click();
	await page.getByRole('link', { name: 'View book' }).click();
	await expect(page).toHaveURL(/\/books\/\d+$/);
	const bookUrl = page.url();
	await expect(page.getByRole('button', { name: 'To-read' })).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('navigation').getByRole('link', { name: 'Shelves' }).click();
	await expect(page).toHaveURL(/\/shelves$/);
	const tabs = page.getByRole('navigation', { name: 'Shelves' });
	await expect(tabs.getByRole('link', { name: /To-read/ })).toHaveAttribute('aria-current', 'page');
	const item = page.getByRole('article').filter({ hasText: 'The Left Hand of Darkness' });
	await expect(item).toBeVisible();

	await item.getByRole('button', { name: 'Reading' }).click();
	await expect(item).toHaveCount(0);
	await tabs.getByRole('link', { name: /Reading/ }).click();
	await expect(page).toHaveURL(/\/shelves\?tab=reading$/);
	await expect(item).toBeVisible();

	// Finishing from the shelves page also prompts for a review.
	await item.getByRole('button', { name: 'Finished' }).click();
	await expect(page).toHaveURL(new RegExp(`${bookUrl.replace(/[/.?]/g, '\\$&')}\\?review=1$`));
	await page.getByRole('link', { name: 'Skip' }).click();
	await page.goto('/shelves?tab=finished');
	await expect(item).toBeVisible();
	await page.goto('/shelves?tab=nonsense');
	await expect(tabs.getByRole('link', { name: /To-read/ })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('switching shelf tabs needs no server round trip', async ({ page }) => {
	const me = await newMember('Tabber');
	await withE2eDb(async (db) => {
		const a = await addManualBook(db, { title: 'Queue Tome', author: 'A' }, me.id);
		const b = await addManualBook(db, { title: 'Current Tome', author: 'B' }, me.id);
		const c = await addManualBook(db, { title: 'Done Tome', author: 'C' }, me.id);
		await setShelf(db, me.id, a, 'to_read');
		await setShelf(db, me.id, b, 'reading');
		await setShelf(db, me.id, c, 'finished');
	});
	await logIn(page, me.username);
	await page.goto('/shelves');
	const tabs = page.getByRole('navigation', { name: 'Shelves' });
	await expect(page.getByRole('link', { name: 'Queue Tome' })).toBeVisible();

	const dataRequests: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('__data.json')) dataRequests.push(r.url());
	});
	await tabs.getByRole('link', { name: /Reading/ }).click();
	await expect(page.getByRole('link', { name: 'Current Tome' })).toBeVisible();
	await tabs.getByRole('link', { name: /Finished/ }).click();
	await expect(page.getByRole('link', { name: 'Done Tome' })).toBeVisible();
	await expect(page).toHaveURL(/\?tab=finished$/);
	expect(dataRequests).toEqual([]);
});

test('shelf tab stays put after moving a book', async ({ page }) => {
	const me = await newMember('Mover');
	await withE2eDb(async (db) => {
		const a = await addManualBook(db, { title: 'Stay Tome', author: 'A' }, me.id);
		const b = await addManualBook(db, { title: 'Go Tome', author: 'B' }, me.id);
		await setShelf(db, me.id, a, 'reading');
		await setShelf(db, me.id, b, 'reading');
	});
	await logIn(page, me.username);
	await page.goto('/shelves');
	await page.waitForLoadState('networkidle');
	const tabs = page.getByRole('navigation', { name: 'Shelves' });
	await tabs.getByRole('link', { name: /Reading/ }).click();
	await expect(page.getByRole('link', { name: 'Go Tome' })).toBeVisible();
	const item = page.getByRole('article').filter({ hasText: 'Go Tome' });
	await item.getByRole('button', { name: 'To-read' }).click();
	await expect(item).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Stay Tome' })).toBeVisible();
	await expect(tabs.getByRole('link', { name: /Reading/ })).toHaveAttribute('aria-current', 'page');
});

test('reading pages fit a 360px screen without horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 });
	const friend = await newMember('Alexandria Longname');
	const me = await newMember('Narrow');
	const bookId = await withE2eDb(async (db) => {
		await follow(db, me.id, friend.id);
		const id = await addManualBook(
			db,
			{
				title: uniq('An Unusually Long Title For A Novel About Many Things '),
				author: 'Wordy Author'
			},
			friend.id
		);
		await saveReview(db, friend.id, id, { rating: 5, body: 'x'.repeat(300) });
		const shelved = await addManualBook(db, { title: uniq('Shelved '), author: 'A' }, me.id);
		await setShelf(db, me.id, shelved, 'to_read');
		return id;
	});
	await logIn(page, me.username);
	const paths = ['/', '/search?q=le+guin', '/search?q=outage', `/books/${bookId}`, '/shelves'];
	for (const path of paths) {
		await page.goto(path);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
	}
});
