import { error } from '@sveltejs/kit';
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
export function formId(form: FormData, name: string): number {
	const raw = String(form.get(name) ?? '');
	const id = /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(id)) throw new UserError('That book no longer exists.');
	return id;
}

export function formStatus(form: FormData): ShelfStatus {
	const status = form.get('status');
	if (!isShelfStatus(status)) throw new UserError('Pick To-read, Reading or Finished.');
	return status;
}
