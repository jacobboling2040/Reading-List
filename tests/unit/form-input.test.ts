import { describe, it, expect } from 'vitest';
import { formId, withUserErrors } from '../../src/lib/server/form-input';
import { UserError } from '../../src/lib/server/errors';

const formWith = (value: string) => {
	const f = new FormData();
	f.set('id', value);
	return f;
};

describe('formId', () => {
	it('returns a positive integer', () => {
		expect(formId(formWith('42'), 'id', 'bad')).toBe(42);
	});
	it('throws the caller-supplied message for bad input', () => {
		for (const bad of ['', '0', '-1', 'abc', '1.5']) {
			expect(() => formId(formWith(bad), 'id', 'Unknown member.')).toThrow('Unknown member.');
		}
	});
});

describe('withUserErrors', () => {
	it('passes results through', async () => {
		expect(await withUserErrors(async () => 7)).toBe(7);
	});
	it('turns a UserError into a 400 failure with extras', async () => {
		const r = await withUserErrors(
			async () => {
				throw new UserError('nope');
			},
			{ section: 'x' }
		);
		expect(r).toMatchObject({ status: 400, data: { section: 'x', message: 'nope' } });
	});
	it('rethrows other errors', async () => {
		await expect(
			withUserErrors(async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
	});
});
