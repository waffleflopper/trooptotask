import { afterEach, describe, expect, it } from 'vitest';
import {
	checkAccountSetupCompletionRateLimit,
	checkAccountSetupRenewalRateLimit,
	resetAccountSetupRateLimits
} from './accountSetupRateLimit';

describe('Account Setup rate limits', () => {
	afterEach(() => {
		resetAccountSetupRateLimits();
	});

	it('limits fresh-link renewal by normalized email', () => {
		const now = new Date('2026-05-22T12:00:00.000Z');

		expect(checkAccountSetupRenewalRateLimit({ email: 'Soldier@Example.mil', now })).toEqual({ limited: false });
		expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now })).toEqual({ limited: false });
		expect(checkAccountSetupRenewalRateLimit({ email: ' SOLDIER@example.mil ', now })).toEqual({ limited: false });

		expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now })).toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});
	});

	it('allows fresh-link renewal again after the renewal window resets', () => {
		const now = new Date('2026-05-22T12:00:00.000Z');

		for (let attempt = 0; attempt < 3; attempt += 1) {
			expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now })).toEqual({
				limited: false
			});
		}
		expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now })).toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});

		expect(
			checkAccountSetupRenewalRateLimit({
				email: 'soldier@example.mil',
				now: new Date('2026-05-22T13:00:00.001Z')
			})
		).toEqual({ limited: false });
	});

	it('limits fresh-link renewal by client address to reduce inbox flooding', () => {
		const now = new Date('2026-05-22T12:00:00.000Z');

		for (const email of ['one@example.mil', 'two@example.mil', 'three@example.mil']) {
			expect(checkAccountSetupRenewalRateLimit({ email, ip: '203.0.113.10', now })).toEqual({
				limited: false
			});
		}

		expect(
			checkAccountSetupRenewalRateLimit({
				email: 'four@example.mil',
				ip: '203.0.113.10',
				now
			})
		).toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});
	});

	it('limits setup completion attempts by setup link and access request without raw tokens', () => {
		const now = new Date('2026-05-22T12:00:00.000Z');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				checkAccountSetupCompletionRateLimit({
					setupLinkId: 'setup-link-1',
					accessRequestId: 'request-1',
					email: 'soldier@example.mil',
					ip: '203.0.113.10',
					now
				})
			).toEqual({ limited: false });
		}

		expect(
			checkAccountSetupCompletionRateLimit({
				setupLinkId: 'setup-link-1',
				accessRequestId: 'request-1',
				email: 'different@example.mil',
				ip: '203.0.113.11',
				now
			})
		).toEqual({
			limited: true,
			retryAfterMs: 15 * 60 * 1000
		});
	});

	it('limits setup completion attempts even when request email is unavailable', () => {
		const now = new Date('2026-05-22T12:00:00.000Z');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				checkAccountSetupCompletionRateLimit({
					setupLinkId: 'setup-link-1',
					accessRequestId: 'request-1',
					email: null,
					now
				})
			).toEqual({ limited: false });
		}

		expect(
			checkAccountSetupCompletionRateLimit({
				setupLinkId: 'setup-link-1',
				accessRequestId: 'request-1',
				email: null,
				now
			})
		).toEqual({
			limited: true,
			retryAfterMs: 15 * 60 * 1000
		});
	});
});
