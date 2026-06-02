import { describe, expect, it } from 'vitest';
import { parseUserProfileForm } from './userProfile';

describe('parseUserProfileForm', () => {
	it('accepts required profile fields with a controlled-list rank', () => {
		expect(
			parseUserProfileForm({
				firstName: '  Emma ',
				lastName: ' Hayes ',
				rank: 'CPT'
			})
		).toEqual({
			firstName: 'Emma',
			lastName: 'Hayes',
			rank: 'CPT'
		});
	});

	it('rejects free-text ranks', () => {
		expect(
			parseUserProfileForm({
				firstName: 'Emma',
				lastName: 'Hayes',
				rank: 'Commander'
			})
		).toMatchObject({ error: expect.any(String) });
	});
});
