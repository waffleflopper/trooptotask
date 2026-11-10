import { describe, expect, it } from 'vitest';
import { addressesToRetry, parseInviteAddresses } from './inviteAddresses';

describe('parseInviteAddresses', () => {
	it('splits pasted addresses on commas, semicolons, spaces and line breaks, lowercased and deduplicated in order', () => {
		expect(
			parseInviteAddresses(' A@Example.com,b@example.com\n\nc@example.com; a@example.com\td@example.com ,')
		).toEqual(['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']);
	});

	it('takes the addresses out of a recipient list copied from a mail client', () => {
		expect(parseInviteAddresses('Jane Doe <jane@example.com>; <john@example.com>')).toEqual([
			'jane',
			'doe',
			'jane@example.com',
			'john@example.com'
		]);
	});

	it('finds no address in blank text', () => {
		expect(parseInviteAddresses(' ,\n; ')).toEqual([]);
	});
});

describe('addressesToRetry', () => {
	it('keeps only the addresses no invitation covers yet', () => {
		expect(
			addressesToRetry([
				{ email: 'a@example.com', status: 'invited', message: 'Invited.' },
				{ email: 'bad', status: 'failed', message: 'Not a valid email address.' },
				{ email: 'b@example.com', status: 'already-invited', message: 'Already invited.' },
				{ email: 'c@example.com', status: 'failed', message: 'Too many attempts.' }
			])
		).toEqual(['bad', 'c@example.com']);
	});
});
