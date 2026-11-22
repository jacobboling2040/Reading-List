import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db/client';
import { SESSION_COOKIE } from '../../../lib/server/auth/session';
import { withUserErrors } from '../../../lib/server/form-input';
import { changePassword, deleteAccount, updateDisplayName } from '../../../lib/server/users';
import type { Actions } from './$types';

const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export const actions: Actions = {
	name: ({ locals, request }) =>
		withUserErrors(
			async () => {
				const form = await request.formData();
				await updateDisplayName(getDb(), locals.user!.id, text(form, 'displayName'));
				return { section: 'name', message: null, saved: 'Name saved.' };
			},
			{ section: 'name' }
		),
	password: ({ locals, request, cookies }) =>
		withUserErrors(
			async () => {
				const form = await request.formData();
				await changePassword(
					getDb(),
					locals.user!.id,
					text(form, 'current'),
					text(form, 'next'),
					cookies.get(SESSION_COOKIE)
				);
				return { section: 'password', message: null, saved: 'Password changed.' };
			},
			{ section: 'password' }
		),
	delete: async ({ locals, request, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		if (text(form, 'confirm').trim().toLowerCase() !== user.username.toLowerCase()) {
			return fail(400, { section: 'delete', message: 'What you typed must match your username.' });
		}
		const failed = await withUserErrors(() => deleteAccount(getDb(), user.id), {
			section: 'delete'
		});
		if (failed) return failed;
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
