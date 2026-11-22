import { fail } from '@sveltejs/kit';
import { getDb } from '../../lib/server/db/client';
import { dismiss, getForYou } from '../../lib/server/for-you';
import { setShelf } from '../../lib/server/shelves';
import { UserError } from '../../lib/server/errors';
import { formId } from '../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { followsAnyone, cards } = await getForYou(getDb(), locals.user!.id);
	return {
		followsAnyone,
		cards: cards.map(({ book, lovers, snippet }) => ({ book, lovers, snippet }))
	};
};

async function act(request: Request, run: (bookId: number) => Promise<void>) {
	try {
		await run(formId(await request.formData(), 'bookId'));
	} catch (e) {
		if (e instanceof UserError) return fail(400, { message: e.message });
		throw e;
	}
}

export const actions: Actions = {
	toRead: ({ request, locals }) =>
		act(request, (bookId) => setShelf(getDb(), locals.user!.id, bookId, 'to_read')),
	dismiss: ({ request, locals }) =>
		act(request, (bookId) => dismiss(getDb(), locals.user!.id, bookId))
};
