import { error, fail } from '@sveltejs/kit';
import { getDb } from '../../../../lib/server/db/client';
import { follow, getProfile, isFollowing, unfollow } from '../../../../lib/server/follows';
import { UserError } from '../../../../lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = getDb();
	const profile = await getProfile(db, params.username);
	if (!profile) error(404, 'Not found');
	const me = locals.user!.id;
	const isSelf = profile.id === me;
	return { profile, isSelf, following: isSelf ? false : await isFollowing(db, me, profile.id) };
};

async function change(
	{ locals, params }: { locals: App.Locals; params: { username: string } },
	fn: typeof follow
) {
	try {
		const profile = await getProfile(getDb(), params.username);
		if (!profile) error(404, 'Not found');
		await fn(getDb(), locals.user!.id, profile.id);
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
