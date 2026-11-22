import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../../lib/server/db/client';
import { users } from '../../../lib/server/db/schema';
import { requireAdmin } from '../../../lib/server/auth/guard';
import { UserError } from '../../../lib/server/errors';
import {
	createPasswordReset,
	listAllPendingInvites,
	revokeInvite,
	setDeactivated
} from '../../../lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const members = await db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			isAdmin: users.isAdmin,
			deactivatedAt: users.deactivatedAt
		})
		.from(users)
		.orderBy(asc(users.id));
	return { members, invites: await listAllPendingInvites(db) };
};

async function userId(request: Request): Promise<{ form: FormData; id: number }> {
	const form = await request.formData();
	const id = Number(form.get('userId'));
	if (!Number.isInteger(id)) throw new UserError('Unknown member.');
	return { form, id };
}

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof UserError) return fail(400, { message: e.message });
		throw e;
	}
}

export const actions: Actions = {
	deactivate: ({ locals, request }) => {
		const admin = requireAdmin(locals);
		return run(async () => {
			const { id } = await userId(request);
			if (id === admin.id) throw new UserError("You can't deactivate yourself.");
			await setDeactivated(getDb(), id, true);
			return { message: null };
		});
	},
	reactivate: ({ locals, request }) => {
		requireAdmin(locals);
		return run(async () => {
			const { id } = await userId(request);
			await setDeactivated(getDb(), id, false);
			return { message: null };
		});
	},
	reset: ({ locals, request, url }) => {
		requireAdmin(locals);
		return run(async () => {
			const { id } = await userId(request);
			const token = await createPasswordReset(getDb(), id);
			return {
				message: null,
				resetFor: id,
				resetLink: `${url.origin}/reset/${token}`
			};
		});
	},
	revoke: ({ locals, request }) => {
		const admin = requireAdmin(locals);
		return run(async () => {
			const form = await request.formData();
			await revokeInvite(getDb(), String(form.get('token') ?? ''), admin.id);
			return { message: null };
		});
	}
};
