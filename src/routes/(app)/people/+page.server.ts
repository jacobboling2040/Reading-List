import { getDb } from '../../../lib/server/db/client';
import { follow, listMembers, unfollow } from '../../../lib/server/follows';
import { formId, withUserErrors } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	members: await listMembers(getDb(), locals.user!.id)
});

function change({ locals, request }: { locals: App.Locals; request: Request }, fn: typeof follow) {
	return withUserErrors(async () => {
		const form = await request.formData();
		await fn(getDb(), locals.user!.id, formId(form, 'userId', 'Unknown member.'));
		return { message: null };
	});
}

export const actions: Actions = {
	follow: (event) => change(event, follow),
	unfollow: (event) => change(event, unfollow)
};
