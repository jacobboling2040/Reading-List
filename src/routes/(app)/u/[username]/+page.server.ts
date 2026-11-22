import { error } from '@sveltejs/kit';
import { getDb } from '../../../../lib/server/db/client';
import {
	findActiveUserId,
	follow,
	getProfile,
	isFollowing,
	unfollow
} from '../../../../lib/server/follows';
import { isShelfStatus, withUserErrors } from '../../../../lib/server/form-input';
import { listShelf } from '../../../../lib/server/shelves';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const db = getDb();
	const profile = await getProfile(db, params.username);
	if (!profile) error(404, 'Not found');
	const me = locals.user!.id;
	const isSelf = profile.id === me;
	const param = url.searchParams.get('tab');
	const tab = isShelfStatus(param) ? param : null;
	return {
		profile,
		isSelf,
		following: isSelf ? false : await isFollowing(db, me, profile.id),
		tab,
		shelf: tab ? await listShelf(db, profile.id, tab) : []
	};
};

function change(
	{ locals, params }: { locals: App.Locals; params: { username: string } },
	fn: typeof follow
) {
	return withUserErrors(async () => {
		const targetId = await findActiveUserId(getDb(), params.username);
		if (targetId === null) error(404, 'Not found');
		await fn(getDb(), locals.user!.id, targetId);
		return { message: null };
	});
}

export const actions: Actions = {
	follow: (event) => change(event, follow),
	unfollow: (event) => change(event, unfollow)
};
