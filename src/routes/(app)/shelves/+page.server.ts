import { redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { listAllShelves, removeFromShelf, setShelf } from '../../../lib/server/shelves';
import { formId, formStatus, isShelfStatus, withUserErrors } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = getDb();
	const param = url.searchParams.get('tab');
	const tab = isShelfStatus(param) ? param : 'to_read';
	const shelves = await listAllShelves(db, locals.user!.id);
	const counts = {
		to_read: shelves.to_read.length,
		reading: shelves.reading.length,
		finished: shelves.finished.length
	};
	return { tab, shelves, counts };
};

const NO_BOOK = 'That book no longer exists.';

export const actions: Actions = {
	move: async ({ request, locals }) => {
		const form = await request.formData();
		let bookId = 0;
		const failed = await withUserErrors(async () => {
			bookId = formId(form, 'bookId', NO_BOOK);
			await setShelf(getDb(), locals.user!.id, bookId, formStatus(form));
		});
		if (failed) return failed;
		// Finishing a book prompts for a review, which the member can skip.
		if (form.get('status') === 'finished') redirect(303, `/books/${bookId}?review=1`);
	},
	remove: async ({ request, locals }) =>
		(await withUserErrors(async () => {
			const bookId = formId(await request.formData(), 'bookId', NO_BOOK);
			await removeFromShelf(getDb(), locals.user!.id, bookId);
		})) ?? undefined
};
