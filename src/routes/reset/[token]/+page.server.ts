import { redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { isResetTokenValid, resetPassword } from '../../../lib/server/users';
import { withUserErrors } from '../../../lib/server/form-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	valid: await isResetTokenValid(getDb(), params.token)
});

export const actions: Actions = {
	default: async ({ request, params }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const failed = await withUserErrors(() => resetPassword(getDb(), params.token, password));
		if (failed) return failed;
		redirect(303, '/login?notice=reset');
	}
};
