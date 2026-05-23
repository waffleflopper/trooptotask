import { describe, expect, it, vi } from 'vitest';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	hashRateLimitDimension,
	normalizeRateLimitEmail,
	type DurableRateLimitStore
} from './durableRateLimit';

function makeSharedStore(): DurableRateLimitStore & { keys: string[] } {
	const buckets = new Map<string, { count: number; resetAt: number }>();
	const keys: string[] = [];

	return {
		keys,
		async checkBucket(input) {
			keys.push(input.key);
			const nowMs = input.now.getTime();
			const existing = buckets.get(input.key);
			if (!existing || nowMs > existing.resetAt) {
				buckets.set(input.key, { count: 1, resetAt: nowMs + input.windowMs });
				return { limited: false };
			}

			existing.count += 1;
			if (existing.count > input.maxRequests) {
				return { limited: true, retryAfterMs: existing.resetAt - nowMs };
			}

			return { limited: false };
		}
	};
}

describe('durable rate limit', () => {
	it('normalizes email dimensions before hashing bucket keys', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (const email of ['Soldier@Example.mil', 'soldier@example.mil', ' SOLDIER@example.mil ']) {
			await expect(
				checkDurableRateLimit({
					namespace: 'access-request-submission',
					dimensions: [{ name: 'email', value: normalizeRateLimitEmail(email) }],
					windowMs: 60 * 60 * 1000,
					maxRequests: 3,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		await expect(
			checkDurableRateLimit({
				namespace: 'access-request-submission',
				dimensions: [{ name: 'email', value: normalizeRateLimitEmail('soldier@example.mil') }],
				windowMs: 60 * 60 * 1000,
				maxRequests: 3,
				now,
				store
			})
		).resolves.toMatchObject({
			limited: true,
			retryAfterMs: 60 * 60 * 1000,
			dimensions: ['email'],
			limitedDimensions: ['email']
		});

		expect(new Set(store.keys).size).toBe(1);
		expect(store.keys[0]).toMatch(/^access-request-submission:email:[a-f0-9]{64}$/);
		expect(store.keys.join('\n')).not.toContain('soldier@example.mil');
	});

	it('allows requests again after the durable window resets', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (let attempt = 0; attempt < 2; attempt += 1) {
			await expect(
				checkDurableRateLimit({
					namespace: 'access-request-submission',
					dimensions: [{ name: 'ip', value: '203.0.113.10' }],
					windowMs: 60_000,
					maxRequests: 2,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		await expect(
			checkDurableRateLimit({
				namespace: 'access-request-submission',
				dimensions: [{ name: 'ip', value: '203.0.113.10' }],
				windowMs: 60_000,
				maxRequests: 2,
				now,
				store
			})
		).resolves.toMatchObject({ limited: true, retryAfterMs: 60_000 });

		await expect(
			checkDurableRateLimit({
				namespace: 'access-request-submission',
				dimensions: [{ name: 'ip', value: '203.0.113.10' }],
				windowMs: 60_000,
				maxRequests: 2,
				now: new Date('2026-05-22T12:01:00.001Z'),
				store
			})
		).resolves.toMatchObject({ limited: false });
	});

	it('checks every dimension and returns the longest retry window', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store: DurableRateLimitStore = {
			async checkBucket(input) {
				if (input.key.includes(':email:')) {
					return { limited: true, retryAfterMs: 30_000 };
				}
				if (input.key.includes(':ip:')) {
					return { limited: true, retryAfterMs: 90_000 };
				}
				return { limited: false };
			}
		};

		await expect(
			checkDurableRateLimit({
				namespace: 'access-request-submission',
				dimensions: [
					{ name: 'email', value: 'soldier@example.mil' },
					{ name: 'ip', value: '203.0.113.10' }
				],
				windowMs: 60 * 60 * 1000,
				maxRequests: 5,
				now,
				store
			})
		).resolves.toMatchObject({
			limited: true,
			retryAfterMs: 90_000,
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email', 'ip']
		});
	});

	it('preserves a limited decision even when retry metadata is zero at the reset boundary', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store: DurableRateLimitStore = {
			async checkBucket() {
				return { limited: true, retryAfterMs: 0 };
			}
		};

		await expect(
			checkDurableRateLimit({
				namespace: 'access-request-submission',
				dimensions: [{ name: 'email', value: 'soldier@example.mil' }],
				windowMs: 60 * 60 * 1000,
				maxRequests: 5,
				now,
				store
			})
		).resolves.toMatchObject({
			limited: true,
			retryAfterMs: 0,
			limitedDimensions: ['email']
		});
	});

	it('keeps audit metadata free of raw dimension values and bucket hashes', () => {
		const details = durableRateLimitAuditDetails({
			limited: true,
			namespace: 'access-request-submission',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 60_000
		});

		expect(details).toEqual({
			namespace: 'access-request-submission',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 60_000
		});
		expect(JSON.stringify(details)).not.toContain('soldier@example.mil');
		expect(JSON.stringify(details)).not.toContain(hashRateLimitDimension('soldier@example.mil'));
	});

	it('uses the shared Supabase durable rate-limit RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: true, retry_after_ms: 1234 }], error: null });
		const store = createSupabaseDurableRateLimitStore({ rpc } as never);

		await expect(
			store.checkBucket({
				key: 'access-request-submission:email:hashed',
				windowMs: 60 * 60 * 1000,
				maxRequests: 5,
				now: new Date('2026-05-22T12:00:00.000Z')
			})
		).resolves.toEqual({ limited: true, retryAfterMs: 1234 });
		expect(rpc).toHaveBeenCalledWith('check_durable_rate_limit', {
			p_bucket_key: 'access-request-submission:email:hashed',
			p_window_seconds: 3600,
			p_max_requests: 5,
			p_checked_at: '2026-05-22T12:00:00.000Z'
		});
	});
});
