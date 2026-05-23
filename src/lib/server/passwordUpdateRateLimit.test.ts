import { describe, expect, it } from 'vitest';
import { checkPasswordUpdateRateLimit, passwordUpdateRateLimitAuditDetails } from './passwordUpdateRateLimit';
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

describe('password update rate limits', () => {
	it('limits in-app password updates by user and client address without exposing raw identifiers', async () => {
		const store = makeSharedStore();
		const now = new Date('2026-05-22T12:00:00Z');

		for (let i = 0; i < 5; i += 1) {
			await expect(
				checkPasswordUpdateRateLimit({
					userId: 'user-123',
					ip: '203.0.113.10',
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkPasswordUpdateRateLimit({
			userId: 'user-123',
			ip: '203.0.113.10',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			namespace: 'password-update',
			dimensions: ['user', 'ip'],
			limitedDimensions: ['user', 'ip'],
			retryAfterMs: 15 * 60 * 1000
		});
		expect(JSON.stringify(passwordUpdateRateLimitAuditDetails(decision))).not.toContain('user-123');
		expect(JSON.stringify(passwordUpdateRateLimitAuditDetails(decision))).not.toContain('203.0.113.10');
	});

	it('rejects checks without a user dimension', async () => {
		expect(() => checkPasswordUpdateRateLimit({ userId: '   ', store: makeSharedStore() })).toThrow(
			'userId is required for password update rate limiting'
		);
	});
});
