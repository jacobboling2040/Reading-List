import type { Db } from '../db/client';
import { isPublicPath } from './guard';
import { SESSION_COOKIE, setSessionCookie, validateSession, type SessionUser } from './session';

const ROBOTS_TAG = 'noindex, nofollow';

type AuthEvent = {
	cookies: {
		get: (name: string) => string | undefined;
		set: (name: string, value: string, opts: Record<string, unknown> & { path: string }) => void;
	};
	url: URL;
	locals: { user: SessionUser | null };
};

/** Session lookup, cookie renewal, login redirect and the noindex header, kept separate from SvelteKit for testing. */
export async function handleAuth<E extends AuthEvent>(
	db: Db,
	event: E,
	resolve: (event: E) => Response | Promise<Response>
): Promise<Response> {
	const token = event.cookies.get(SESSION_COOKIE);
	const session = token ? await validateSession(db, token) : null;
	event.locals.user = session?.user ?? null;
	if (token && session?.renewed) setSessionCookie(event.cookies, token, session.expiresAt);

	if (!event.locals.user && !isPublicPath(event.url.pathname)) {
		const next = encodeURIComponent(event.url.pathname + event.url.search);
		return new Response(null, {
			status: 303,
			headers: { location: `/login?next=${next}`, 'X-Robots-Tag': ROBOTS_TAG }
		});
	}

	const response = await resolve(event);
	response.headers.set('X-Robots-Tag', ROBOTS_TAG);
	return response;
}
