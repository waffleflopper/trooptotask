import { describe, expect, it } from 'vitest';
import { dodIdInputSchema } from './dodId';

describe('DoD ID input', () => {
	it.each([
		['0123456789', '0123456789'],
		['  012-345 6789  ', '0123456789'],
		['', ''],
		[' - ', '']
	])('normalizes %j to %j', (input, expected) => {
		expect(dodIdInputSchema.parse(input)).toBe(expected);
	});

	it.each(['123456789', '12345678901', '123456789a', '12345.6789', '１２３４５６７８９０', 1234567890, null])(
		'rejects %j',
		(input) => {
			expect(dodIdInputSchema.safeParse(input).success).toBe(false);
		}
	);
});
