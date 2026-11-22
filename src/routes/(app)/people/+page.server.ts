import { fail } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { follow, listMembers, unfollow } from '../../../lib/server/follows';
import { UserError } from '../../../lib/server/errors';
import { formId } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	members: await listMembers(getDb(), locals.user!.id)
});

async function change(
	{ locals, request }: { locals: App.Locals; request: Request },
	fn: typeof follow
) {
	try {
		const form = await request.formData();
		await fn(getDb(), locals.user!.id, formId(form, 'userId'));
		return { message: null };
	} catch (e) {
		if (e instanceof UserError) return fail(400, { message: e.message });
		throw e;
	}
}

export const actions: Actions = {
	follow: (event) => change(event, follow),
	unfollow: (event) => change(event, unfollow)
};
