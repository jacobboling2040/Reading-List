import { redirect } from '@sveltejs/kit';
import {
	SCHEME_COOKIE,
	THEME_COOKIE,
	THEME_COOKIE_MAX_AGE,
	parseThemePrefs
} from '../../../../lib/theme';
import type { RequestHandler } from './$types';

/** Same-origin path from the Referer, else /settings; never an absolute or protocol-relative URL. */
function backPath(referer: string | null, origin: string): string {
	try {
		const url = new URL(referer ?? '', origin);
		if (url.origin === origin && !url.pathname.startsWith('//')) return url.pathname + url.search;
	} catch {
		// unparseable Referer: fall through
	}
	return '/settings';
}

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
	const form = await request.formData();
	const field = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : undefined;
	};
	// Missing fields keep the current value; invalid ones fall back to the defaults.
	const prefs = parseThemePrefs(field('mode') ?? locals.theme.mode, field('scheme') ?? locals.theme.scheme);
	// The JS path already wrote both cookies in the browser; setting them here too would let
	// out-of-order background saves leave a stale cookie.
	if (request.headers.get('accept')?.includes('application/json')) return Response.json(prefs);

	const opts = {
		path: '/',
		maxAge: THEME_COOKIE_MAX_AGE,
		sameSite: 'lax',
		httpOnly: false,
		secure: url.protocol === 'https:'
	} as const;
	cookies.set(THEME_COOKIE, prefs.mode, opts);
	cookies.set(SCHEME_COOKIE, prefs.scheme, opts);

	redirect(303, backPath(request.headers.get('referer'), url.origin));
};
