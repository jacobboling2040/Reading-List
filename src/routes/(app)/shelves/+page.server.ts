import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { listShelf, removeFromShelf, setShelf, shelfCounts } from '../../../lib/server/shelves';
import { UserError } from '../../../lib/server/errors';
import { formId, formStatus, isShelfStatus } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = getDb();
	const param = url.searchParams.get('tab');
	const tab = isShelfStatus(param) ? param : 'to_read';
	const [books, counts] = await Promise.all([
		listShelf(db, locals.user!.id, tab),
		shelfCounts(db, locals.user!.id)
	]);
	return { tab, books, counts };
};

export const actions: Actions = {
	move: async ({ request, locals }) => {
		const form = await request.formData();
		let bookId: number;
		try {
			bookId = formId(form, 'bookId');
			await setShelf(getDb(), locals.user!.id, bookId, formStatus(form));
		} catch (e) {
			if (e instanceof UserError) return fail(400, { message: e.message });
			throw e;
		}
		// Finishing a book prompts for a review, which the member can skip.
		if (form.get('status') === 'finished') redirect(303, `/books/${bookId}?review=1`);
	},
	remove: async ({ request, locals }) => {
		try {
			const bookId = formId(await request.formData(), 'bookId');
			await removeFromShelf(getDb(), locals.user!.id, bookId);
		} catch (e) {
			if (e instanceof UserError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
