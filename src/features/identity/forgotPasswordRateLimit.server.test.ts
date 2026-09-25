import { describe, expect, it, vi } from 'vitest';
import { checkForgotPasswordRateLimit, forgotPasswordRateLimitAuditDetails } from './forgotPasswordRateLimit.server';
import { createSupabaseDurableRateLimitStore, type DurableRateLimitStore } from '$lib/access/index.server';

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

	it('uses the retained provider budget, shares normalized email buckets and denies malformed provider decisions', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: false, retry_after_ms: 0 }], error: null });
		const store = createSupabaseDurableRateLimitStore({ rpc } as never);
		const now = new Date('2026-09-17T12:00:00.000Z');
		await checkForgotPasswordRateLimit({ email: ' Synthetic@Example.test ', now, store });
		await checkForgotPasswordRateLimit({ email: 'synthetic@example.test', now, store });
		await checkForgotPasswordRateLimit({ email: 'other@example.test', now, store });
		const buckets = rpc.mock.calls.map(
			([, args]) => args as { p_bucket_key: string; p_window_seconds: number; p_max_requests: number }
		);
		expect(buckets.map(({ p_window_seconds, p_max_requests }) => [p_window_seconds, p_max_requests])).toEqual(
			Array(3).fill([3600, 3])
		);
		expect(buckets[0].p_bucket_key).toBe(buckets[1].p_bucket_key);
		expect(buckets[2].p_bucket_key).not.toBe(buckets[0].p_bucket_key);
		rpc.mockResolvedValueOnce({ data: [{}], error: null });
		await expect(checkForgotPasswordRateLimit({ email: 'synthetic@example.test', now, store })).rejects.toThrow();
	});
});
