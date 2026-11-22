import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../lib/server/db/client';
import { authenticate } from '../../lib/server/users';
import { checkLoginAllowed, recordFailedLogin } from '../../lib/server/auth/rate-limit';
import { createSession, setSessionCookie } from '../../lib/server/auth/session';
import { safeNext } from '../../lib/server/auth/next';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return {
		next: url.searchParams.get('next') ?? '',
		notice:
			url.searchParams.get('notice') === 'reset'
				? 'Password updated. Log in with your new password.'
				: ''
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = String(form.get('next') ?? '');
		const db = getDb();
		const ip = getClientAddress();

		if (!(await checkLoginAllowed(db, username, ip))) {
			return fail(400, {
				message: 'Too many attempts. Try again in 15 minutes.',
				username
			});
		}
		const user = await authenticate(db, username, password);
		if (!user) {
			await recordFailedLogin(db, username, ip);
			return fail(400, { message: 'Wrong username or password.', username });
		}
		const { token, expiresAt } = await createSession(db, user.id);
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, safeNext(next));
	}
};
