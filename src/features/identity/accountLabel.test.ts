import { describe, expect, it } from 'vitest';
import { accountLabel } from './accountLabel';

const loaded = (profile: { rank: string; firstName: string; lastName: string } | null) => ({
	status: 'loaded' as const,
	profile
});

describe('accountLabel', () => {
	it('names the person by rank and name', () => {
		expect(
			accountLabel({
				email: 'dana@example.test',
				profile: loaded({ rank: 'SFC', firstName: 'Dana', lastName: 'Whitaker' })
			})
		).toEqual({ name: 'SFC Dana Whitaker', initials: 'DW' });
	});

	it('leaves out a missing rank', () => {
		expect(
			accountLabel({ email: null, profile: loaded({ rank: '', firstName: 'Dana', lastName: 'Whitaker' }) })
		).toEqual({ name: 'Dana Whitaker', initials: 'DW' });
	});

	it('falls back to the email without a saved name', () => {
		expect(accountLabel({ email: 'dana@example.test', profile: loaded(null) })).toEqual({
			name: 'dana@example.test',
			initials: 'D'
		});
		expect(accountLabel({ email: 'dana@example.test', profile: { status: 'unavailable' } })).toEqual({
			name: 'dana@example.test',
			initials: 'D'
		});
	});

	it('falls back to Account without a name or email', () => {
		expect(accountLabel({ email: null, profile: { status: 'unavailable' } })).toEqual({
			name: 'Account',
			initials: 'A'
		});
	});
});
