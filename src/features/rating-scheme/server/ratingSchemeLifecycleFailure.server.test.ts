import { describe, expect, it } from 'vitest';
import { lifecycleFailure } from './ratingSchemeLifecycleFailure.server';

describe('lifecycleFailure', () => {
	it.each([
		['42501', 403],
		['55000', 409],
		['P0002', 404],
		['23505', 409],
		['23503', 400],
		['22023', 400]
	])('answers a %s refusal with %i', (code, status) => {
		expect(() => lifecycleFailure({ code, message: 'database reason' })).toThrow(expect.objectContaining({ status }));
	});

	it('passes a 22023 reason through to the user and keeps other reasons private', () => {
		expect(() => lifecycleFailure({ code: '22023', message: 'The new rater is already the rater' })).toThrow(
			expect.objectContaining({ message: 'The new rater is already the rater' })
		);
		expect(() => lifecycleFailure({ code: '55000', message: 'internal step detail' })).toThrow(
			expect.not.objectContaining({ message: 'internal step detail' })
		);
	});

	it('names the rule a 55000 refusal broke when the user can act on it', () => {
		expect(() =>
			lifecycleFailure({ code: '55000', message: 'Another evaluation is already open on this rating scheme' })
		).toThrow(expect.objectContaining({ message: 'Another evaluation is already open on this rating scheme' }));
	});

	it('surfaces an unexpected provider failure as a server error', () => {
		expect(() => lifecycleFailure({ code: '08006', message: 'connection lost' })).toThrow(
			expect.not.objectContaining({ status: expect.any(Number) })
		);
	});
});
