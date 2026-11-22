import { fail } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { createInvite, listInvites, revokeInvite } from '../../../lib/server/users';
import { UserError } from '../../../lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const invites = await listInvites(getDb(), locals.user!.id);
	return {
		invites: invites.map((i) => ({
			token: i.token,
			url: `${url.origin}/join/${i.token}`,
			expiresAt: i.expiresAt
		}))
	};
};

export const actions: Actions = {
	create: async ({ locals, url }) => {
		const token = await createInvite(getDb(), locals.user!.id);
		return { message: null, created: `${url.origin}/join/${token}` };
	},
	revoke: async ({ locals, request }) => {
		try {
			const form = await request.formData();
			await revokeInvite(getDb(), String(form.get('token') ?? ''), locals.user!.id);
			return { message: null };
		} catch (e) {
			if (e instanceof UserError) return fail(400, { message: e.message });
			throw e;
		}
	}
};
