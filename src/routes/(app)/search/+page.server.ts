import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { addManualBook, type SearchResult } from '../../../lib/server/books';
import { addFromSearch, cachedSearch } from '../../../lib/server/search-cache';
import { setShelf, shelfStatusesForWorks, type ShelfStatus } from '../../../lib/server/shelves';
import { UserError } from '../../../lib/server/errors';
import { formStatus, withUserErrors } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	let results: SearchResult[] = [];
	let searchError = '';
	if (q) {
		try {
			results = await cachedSearch(getDb(), q);
		} catch (e) {
			if (!(e instanceof UserError)) throw e;
			searchError = e.message;
		}
	}
	const onShelf = await shelfStatusesForWorks(
		getDb(),
		locals.user!.id,
		results.map((r) => r.olWorkId)
	);
	return { q, results, searchError, onShelf };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const form = await request.formData();
		const q = String(form.get('q') ?? '');
		const olWorkId = String(form.get('olWorkId') ?? '');
		let added: { olWorkId: string; bookId: number; status: ShelfStatus } | undefined;
		const failed = await withUserErrors(async () => {
			const status = formStatus(form);
			const bookId = await addFromSearch(getDb(), locals.user!.id, q, olWorkId, status);
			added = { olWorkId, bookId, status };
		});
		if (failed) return failed;
		return { added: added! };
	},
	manual: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const author = String(form.get('author') ?? '');
		let bookId = 0;
		let status: ShelfStatus;
		try {
			status = formStatus(form);
			bookId = await addManualBook(getDb(), { title, author }, locals.user!.id);
			await setShelf(getDb(), locals.user!.id, bookId, status);
		} catch (e) {
			if (e instanceof UserError) return fail(400, { manualMessage: e.message, title, author });
			throw e;
		}
		redirect(303, status === 'finished' ? `/books/${bookId}?review=1` : `/books/${bookId}`);
	}
};
