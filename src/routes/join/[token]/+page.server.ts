import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { getInvite, redeemInvite } from '../../../lib/server/users';
import { UserError } from '../../../lib/server/errors';
import { createSession, setSessionCookie } from '../../../lib/server/auth/session';
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
		let userId: number;
		try {
			userId = await redeemInvite(db, params.token, {
				username,
				displayName,
				password
			});
		} catch (e) {
			if (e instanceof UserError) return fail(400, { message: e.message, username, displayName });
			throw e;
		}
		const { token, expiresAt } = await createSession(db, userId);
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, '/people');
	}
};
