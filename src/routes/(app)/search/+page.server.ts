import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import {
	addManualBook,
	searchOpenLibrary,
	upsertOpenLibraryBook,
	type SearchResult
} from '../../../lib/server/books';
import { UserError } from '../../../lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	let results: SearchResult[] = [];
	let searchError = '';
	if (q) {
		try {
			results = await searchOpenLibrary(q);
		} catch (e) {
			if (!(e instanceof UserError)) throw e;
			searchError = e.message;
		}
	}
	return { q, results, searchError };
};

export const actions: Actions = {
	// The client sends only the query and the picked work id; the book's details are taken
	// from a fresh search so a member can't store made-up details under a real work id.
	add: async ({ request, locals }) => {
		const form = await request.formData();
		const q = String(form.get('q') ?? '');
		const olWorkId = String(form.get('olWorkId') ?? '');
		let bookId: number;
		try {
			const match = (await searchOpenLibrary(q)).find((r) => r.olWorkId === olWorkId);
			if (!match) throw new UserError("That book isn't in the results any more. Try searching again.");
			bookId = await upsertOpenLibraryBook(getDb(), match, locals.user!.id);
		} catch (e) {
			if (e instanceof UserError) return fail(400, { message: e.message });
			throw e;
		}
		redirect(303, `/books/${bookId}`);
	},
	manual: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const author = String(form.get('author') ?? '');
		let bookId: number;
		try {
			bookId = await addManualBook(getDb(), { title, author }, locals.user!.id);
		} catch (e) {
			if (e instanceof UserError) return fail(400, { manualMessage: e.message, title, author });
			throw e;
		}
		redirect(303, `/books/${bookId}`);
	}
};
