import { error, redirect } from '@sveltejs/kit';
import { getDb } from '../../../../lib/server/db/client';
import { getBook } from '../../../../lib/server/books';
import { getShelfStatus, removeFromShelf, setShelf } from '../../../../lib/server/shelves';
import {
	deleteReview,
	listBookReviews,
	listToReadMembers,
	saveReview
} from '../../../../lib/server/reviews';
import { formStatus, routeId, withUserErrors } from '../../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const db = getDb();
	const userId = locals.user!.id;
	const book = await getBook(db, routeId(params.id));
	if (!book) error(404, 'Not found');
	const [status, allReviews, toRead] = await Promise.all([
		getShelfStatus(db, userId, book.id),
		listBookReviews(db, book.id),
		listToReadMembers(db, book.id)
	]);
	const total = allReviews.reduce((sum, r) => sum + r.rating, 0);
	const mine = allReviews.find((r) => r.userId === userId);
	return {
		book,
		status,
		average: allReviews.length ? total / allReviews.length : null,
		reviewerCount: allReviews.length,
		reviews: allReviews.map(({ userId: id, ...r }) => ({ ...r, isMine: id === userId })),
		mine: mine ? { rating: mine.rating, body: mine.body ?? '' } : null,
		toRead,
		reviewPrompt: url.searchParams.get('review') === '1'
	};
};

export const actions: Actions = {
	shelf: async ({ params, request, locals }) => {
		const bookId = routeId(params.id);
		const form = await request.formData();
		const failed = await withUserErrors(() =>
			setShelf(getDb(), locals.user!.id, bookId, formStatus(form))
		);
		if (failed) return failed;
		// Finishing a book prompts for a review, which the member can skip.
		if (form.get('status') === 'finished') redirect(303, `/books/${bookId}?review=1`);
	},
	remove: async ({ params, locals }) => {
		const bookId = routeId(params.id);
		return (
			(await withUserErrors(() => removeFromShelf(getDb(), locals.user!.id, bookId))) ?? undefined
		);
	},
	review: async ({ params, request, locals }) => {
		const bookId = routeId(params.id);
		const form = await request.formData();
		const rating = Number(form.get('rating'));
		const body = String(form.get('body') ?? '');
		const failed = await withUserErrors(() =>
			saveReview(getDb(), locals.user!.id, bookId, { rating, body })
		);
		if (failed) return failed;
		redirect(303, `/books/${bookId}`);
	},
	deleteReview: async ({ params, locals }) => {
		const bookId = routeId(params.id);
		return (
			(await withUserErrors(() => deleteReview(getDb(), locals.user!.id, bookId))) ?? undefined
		);
	}
};
