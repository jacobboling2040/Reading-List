import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { ShelfStatus } from './shelves';
import { UserError } from './errors';

export const SHELF_STATUSES: readonly ShelfStatus[] = ['to_read', 'reading', 'finished'];

export function isShelfStatus(value: unknown): value is ShelfStatus {
	return typeof value === 'string' && (SHELF_STATUSES as readonly string[]).includes(value);
}

/** A positive integer id from a route param; anything else is a 404. */
export function routeId(raw: string): number {
	if (!/^[1-9]\d{0,15}$/.test(raw)) error(404, 'Not found');
	const id = Number(raw);
	if (!Number.isSafeInteger(id)) error(404, 'Not found');
	return id;
}

/** A positive integer id from a form field; anything else is a user-facing error. */
export function formId(form: FormData, name: string, message: string): number {
	const raw = String(form.get(name) ?? '');
	const id = /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(id)) throw new UserError(message);
	return id;
}

export function formStatus(form: FormData): ShelfStatus {
	const status = form.get('status');
	if (!isShelfStatus(status)) throw new UserError('Pick To-read, Reading or Finished.');
	return status;
}

/**
 * Runs `fn`, turning a UserError into a 400 form failure carrying its message (plus `extra`,
 * e.g. which form section it belongs to). Any other error is rethrown.
 */
export async function withUserErrors<T, E extends Record<string, unknown> = Record<never, never>>(
	fn: () => Promise<T>,
	extra?: E
): Promise<T | ActionFailure<E & { message: string }>> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof UserError) {
			return fail(400, { ...(extra as E), message: e.message });
		}
		throw e;
	}
}
