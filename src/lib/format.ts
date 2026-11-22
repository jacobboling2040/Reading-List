/** Day-precision date, fixed locale and zone so server and client render the same text. */
export function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export const SHELF_LABELS = {
	to_read: 'To-read',
	reading: 'Reading',
	finished: 'Finished'
} as const;
