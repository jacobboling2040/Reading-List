import { getDb } from '../../lib/server/db/client';
import { dismiss, getForYou } from '../../lib/server/for-you';
import { setShelf } from '../../lib/server/shelves';
import { formId, withUserErrors } from '../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { followsAnyone, cards } = await getForYou(getDb(), locals.user!.id);
	return {
		followsAnyone,
		cards: cards.map(({ book, lovers, snippet }) => ({ book, lovers, snippet }))
	};
};

const act = (request: Request, run: (bookId: number) => Promise<void>) =>
	withUserErrors(async () => {
		await run(formId(await request.formData(), 'bookId', 'That book no longer exists.'));
	});

export const actions: Actions = {
	toRead: ({ request, locals }) =>
		act(request, (bookId) => setShelf(getDb(), locals.user!.id, bookId, 'to_read')),
	dismiss: ({ request, locals }) =>
		act(request, (bookId) => dismiss(getDb(), locals.user!.id, bookId))
};
