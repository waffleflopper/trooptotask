import { describe, expect, it } from 'vitest';
import { formatSignIn, organizationsLabel, personHref } from './peopleFormat';

const now = new Date('2026-10-25T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('last sign-in', () => {
	it.each([
		[null, 'Never'],
		[ago(20_000), 'Just now'],
		[ago(12 * MIN), '12 min ago'],
		[ago(2 * HOUR + 5 * MIN), '2 hr ago'],
		[ago(24 * HOUR), '1 day ago'],
		[ago(3 * 24 * HOUR), '3 days ago'],
		['2026-10-02T09:00:00Z', '2 Oct'],
		['2025-12-30T09:00:00Z', '30 Dec 2025']
	])('reads %s as %s', (iso, expected) => {
		expect(formatSignIn(iso, now)).toBe(expected);
	});
});

describe('person pages', () => {
	it('sends an account to its account page and a not-set-up person to the request page', () => {
		expect(personHref({ kind: 'active', userId: 'u1' })).toBe('/admin/people/u1');
		expect(personHref({ kind: 'suspended', userId: 'u2', reason: '', suspendedAt: '2026-10-01T00:00:00Z' })).toBe(
			'/admin/people/u2'
		);
		expect(
			personHref({ kind: 'notSetUp', requestId: 'r1', approvedAt: '2026-10-01T00:00:00Z', linkExpiresAt: null })
		).toBe('/admin/people/not-set-up/r1');
	});

	it('says None yet for a person without an account, and counts Organizations otherwise', () => {
		const notSetUp = {
			kind: 'notSetUp',
			requestId: 'r',
			approvedAt: '2026-10-01T00:00:00Z',
			linkExpiresAt: null
		} as const;
		expect(organizationsLabel(0, notSetUp)).toBe('None yet');
		expect(organizationsLabel(0, { kind: 'active', userId: 'u' })).toBe('None');
		expect(organizationsLabel(1, { kind: 'active', userId: 'u' })).toBe('1 Organization');
		expect(organizationsLabel(3, { kind: 'active', userId: 'u' })).toBe('3 Organizations');
	});
});
