import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../../lib/server/db/client';
import { users } from '../../../lib/server/db/schema';
import { requireAdmin } from '../../../lib/server/auth/guard';
import { UserError } from '../../../lib/server/errors';
import { formId, withUserErrors } from '../../../lib/server/form-input';
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

const UNKNOWN_MEMBER = 'Unknown member.';

async function memberId(request: Request): Promise<number> {
	const id = formId(await request.formData(), 'userId', UNKNOWN_MEMBER);
	const [member] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, id));
	if (!member) throw new UserError(UNKNOWN_MEMBER);
	return id;
}

export const actions: Actions = {
	deactivate: ({ locals, request }) => {
		const admin = requireAdmin(locals);
		return withUserErrors(async () => {
			const id = await memberId(request);
			if (id === admin.id) throw new UserError("You can't deactivate yourself.");
			await setDeactivated(getDb(), id, true);
			return { message: null };
		});
	},
	reactivate: ({ locals, request }) => {
		requireAdmin(locals);
		return withUserErrors(async () => {
			const id = await memberId(request);
			await setDeactivated(getDb(), id, false);
			return { message: null };
		});
	},
	reset: ({ locals, request, url }) => {
		requireAdmin(locals);
		return withUserErrors(async () => {
			const id = await memberId(request);
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
		return withUserErrors(async () => {
			const form = await request.formData();
			await revokeInvite(getDb(), String(form.get('token') ?? ''), admin.id);
			return { message: null };
		});
	}
};
