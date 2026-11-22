import { redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { getInvite, redeemInvite } from '../../../lib/server/users';
import { withUserErrors } from '../../../lib/server/form-input';
import {
	createSession,
	invalidateSession,
	SESSION_COOKIE,
	setSessionCookie
} from '../../../lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	valid: (await getInvite(getDb(), params.token)).valid
});

export const actions: Actions = {
	default: async ({ request, params, cookies }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const displayName = String(form.get('displayName') ?? '');
		const password = String(form.get('password') ?? '');
		const db = getDb();
		let userId = 0;
		const failed = await withUserErrors(
			async () => {
				userId = await redeemInvite(db, params.token, { username, displayName, password });
			},
			{ username, displayName }
		);
		if (failed) return failed;
		// Joining while signed in: end the old session before issuing the new one.
		const previous = cookies.get(SESSION_COOKIE);
		if (previous) await invalidateSession(db, previous);
		const { token, expiresAt } = await createSession(db, userId);
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, '/people');
	}
};
