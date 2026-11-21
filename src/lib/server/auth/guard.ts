import { error } from '@sveltejs/kit';
import type { SessionUser } from './session';

export function isPublicPath(pathname: string): boolean {
	return (
		pathname === '/login' ||
		pathname === '/robots.txt' ||
		pathname.startsWith('/join/') ||
		pathname.startsWith('/reset/')
	);
}

export function requireAdmin(locals: { user: SessionUser | null }): SessionUser {
	if (!locals.user?.isAdmin) error(404, 'Not found');
	return locals.user;
}
