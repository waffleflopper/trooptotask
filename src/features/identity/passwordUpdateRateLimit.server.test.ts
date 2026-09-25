import { describe, expect, it, vi } from 'vitest';
import { checkPasswordUpdateRateLimit } from './passwordUpdateRateLimit.server';
import {
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	type DurableRateLimitStore
} from '$lib/access/index.server';

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
	it.each(['user', 'ip'] as const)(
		'keeps the %s budget independent when the other identity changes',
		async (dimension) => {
			const store = makeSharedStore();
			const now = new Date('2026-09-17T12:00:00Z');
			for (let attempt = 0; attempt < 5; attempt++) {
				await expect(
					checkPasswordUpdateRateLimit({
						userId: dimension === 'user' ? 'user-a' : `user-${attempt}`,
						ip: dimension === 'ip' ? '192.0.2.1' : `192.0.2.${attempt + 1}`,
						now,
						store
					})
				).resolves.toMatchObject({ limited: false });
			}
			await expect(
				checkPasswordUpdateRateLimit({
					userId: dimension === 'user' ? 'user-a' : 'different-user',
					ip: dimension === 'ip' ? '192.0.2.1' : '192.0.2.100',
					now,
					store
				})
			).resolves.toMatchObject({ limited: true, limitedDimensions: [dimension], retryAfterMs: 900_000 });
			await expect(
				checkPasswordUpdateRateLimit({ userId: 'unrelated-user', ip: '192.0.2.200', now, store })
			).resolves.toMatchObject({ limited: false });
		}
	);

	it('retains denial at the exact reset instant and resumes after expiry without a local cached denial', async () => {
		const store = makeSharedStore();
		const input = { userId: 'user-a', store, now: new Date('2026-09-17T12:00:00Z') };
		for (let attempt = 0; attempt < 5; attempt++) {
			await expect(checkPasswordUpdateRateLimit(input)).resolves.toMatchObject({ limited: false });
		}
		await expect(
			checkPasswordUpdateRateLimit({ ...input, now: new Date('2026-09-17T12:14:59.999Z') })
		).resolves.toMatchObject({ limited: true, retryAfterMs: 1 });
		await expect(
			checkPasswordUpdateRateLimit({ ...input, now: new Date('2026-09-17T12:15:00.000Z') })
		).resolves.toMatchObject({ limited: true, retryAfterMs: 0 });
		await expect(
			checkPasswordUpdateRateLimit({ ...input, now: new Date('2026-09-17T12:15:00.001Z') })
		).resolves.toMatchObject({ limited: false });
	});

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
		expect(JSON.stringify(durableRateLimitAuditDetails(decision))).not.toContain('user-123');
		expect(JSON.stringify(durableRateLimitAuditDetails(decision))).not.toContain('203.0.113.10');
	});

	it('rejects checks without a user dimension', async () => {
		expect(() => checkPasswordUpdateRateLimit({ userId: '   ', store: makeSharedStore() })).toThrow(
			'userId is required for password update rate limiting'
		);
	});
});

// Retained provider-acknowledgment coverage from the former cross-owner limiter consumer suite.
it('retains both password budgets and accepts only acknowledged durable decisions', async () => {
	const now = new Date('2026-09-17T12:00:00Z');
	const rpc = vi.fn().mockResolvedValue({ data: [{ limited: false, retry_after_ms: 900_000 }], error: null });
	const store = createSupabaseDurableRateLimitStore({ rpc } as never);
	const check = () => checkPasswordUpdateRateLimit({ userId: 'synthetic-user', ip: '192.0.2.1', now, store });
	await expect(check()).resolves.toMatchObject({ limited: false });
	expect(rpc.mock.calls.map(([, input]) => [input.p_window_seconds, input.p_max_requests])).toEqual([
		[900, 5],
		[900, 5]
	]);
	for (const [, input] of rpc.mock.calls) {
		expect(input.p_checked_at).toBe('2026-09-17T12:00:00.000Z');
		expect(input.p_bucket_key).toMatch(/:[a-f0-9]{64}$/);
		expect(input.p_bucket_key).not.toMatch(/synthetic|192\.0\.2\.1/i);
	}
	rpc.mockResolvedValue({ data: [{ limited: true, retry_after_ms: 1500 }], error: null });
	await expect(check()).resolves.toMatchObject({ limited: true, retryAfterMs: 1500 });
	rpc.mockResolvedValue({ data: [{}], error: null });
	await expect(check()).rejects.toThrow();
	const failure = new Error('synthetic RPC failure');
	rpc.mockResolvedValue({ data: [{ limited: false, retry_after_ms: 0 }], error: failure });
	await expect(check()).rejects.toBe(failure);
});
