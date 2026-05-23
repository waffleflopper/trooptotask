import { describe, expect, it } from 'vitest';
import { checkForgotPasswordRateLimit, forgotPasswordRateLimitAuditDetails } from './forgotPasswordRateLimit';
import type { DurableRateLimitStore } from './durableRateLimit';

function makeSharedStore(): DurableRateLimitStore {
	const buckets = new Map<string, { count: number; resetAt: number }>();

	return {
		async checkBucket(input) {
			const now = input.now.getTime();
			const current = buckets.get(input.key);
			if (!current || current.resetAt < now) {
				buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
				return { limited: false };
			}

			current.count += 1;
			if (current.count > input.maxRequests) {
				return { limited: true, retryAfterMs: current.resetAt - now };
			}

			return { limited: false };
		}
	};
}

describe('forgot-password rate limits', () => {
	it('limits recovery email requests by normalized email and client address without exposing raw identifiers', async () => {
		const store = makeSharedStore();
		const now = new Date('2026-05-22T12:00:00Z');

		for (let i = 0; i < 3; i += 1) {
			await expect(
				checkForgotPasswordRateLimit({
					email: 'Soldier@Example.mil',
					ip: '203.0.113.10',
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkForgotPasswordRateLimit({
			email: ' soldier@example.mil ',
			ip: '203.0.113.10',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email', 'ip'],
			retryAfterMs: 60 * 60 * 1000
		});
		expect(JSON.stringify(forgotPasswordRateLimitAuditDetails(decision))).not.toContain('soldier@example.mil');
		expect(JSON.stringify(forgotPasswordRateLimitAuditDetails(decision))).not.toContain('203.0.113.10');
	});

	it('rejects checks without an email dimension', async () => {
		expect(() => checkForgotPasswordRateLimit({ email: '   ', store: makeSharedStore() })).toThrow(
			'email is required for forgot-password rate limiting'
		);
	});
});
