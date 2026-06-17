import { describe, expect, it, vi } from 'vitest';
import { checkSignupRateLimit, createSupabaseSignupRateLimitStore, type SignupRateLimitStore } from './signupRateLimit';
import { durableRateLimitAuditDetails } from './durableRateLimit';

function makeSharedStore(): SignupRateLimitStore & { keys: string[] } {
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

describe('Signup rate limits', () => {
	it('limits account creation by normalized email and client address', async () => {
		const now = new Date('2026-06-16T12:00:00.000Z');
		const store = makeSharedStore();

		for (const email of [
			'Soldier@Example.mil',
			'soldier@example.mil',
			' SOLDIER@example.mil ',
			'soldier@example.mil',
			'soldier@example.mil'
		]) {
			await expect(checkSignupRateLimit({ email, ip: '203.0.113.10', now, store })).resolves.toMatchObject({
				limited: false
			});
		}

		await expect(
			checkSignupRateLimit({
				email: 'soldier@example.mil',
				ip: '203.0.113.11',
				now,
				store
			})
		).resolves.toEqual({
			limited: true,
			namespace: 'signup',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 60 * 60 * 1000
		});

		expect(new Set(store.keys.filter((key) => key.startsWith('signup:email:'))).size).toBe(1);
		expect(store.keys.some((key) => key.startsWith('signup:ip:'))).toBe(true);
		expect(store.keys.join('\n')).not.toContain('soldier@example.mil');
		expect(store.keys.join('\n')).not.toContain('203.0.113.10');
	});

	it('limits by client address when many emails originate from one IP', async () => {
		const now = new Date('2026-06-16T12:00:00.000Z');
		const store = makeSharedStore();

		for (const email of [
			'one@example.mil',
			'two@example.mil',
			'three@example.mil',
			'four@example.mil',
			'five@example.mil'
		]) {
			await expect(checkSignupRateLimit({ email, ip: '203.0.113.10', now, store })).resolves.toMatchObject({
				limited: false
			});
		}

		const decision = await checkSignupRateLimit({
			email: 'six@example.mil',
			ip: '203.0.113.10',
			now,
			store
		});

		expect(decision).toEqual({
			limited: true,
			namespace: 'signup',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['ip'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 60 * 60 * 1000
		});
		expect(JSON.stringify(durableRateLimitAuditDetails(decision))).not.toContain('six@example.mil');
		expect(JSON.stringify(durableRateLimitAuditDetails(decision))).not.toContain('203.0.113.10');
	});

	it('allows account creation again after the signup window resets', async () => {
		const now = new Date('2026-06-16T12:00:00.000Z');
		const store = makeSharedStore();

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await expect(checkSignupRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toMatchObject({
				limited: false
			});
		}
		await expect(checkSignupRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toMatchObject({
			limited: true
		});
		await expect(
			checkSignupRateLimit({
				email: 'soldier@example.mil',
				now: new Date('2026-06-16T13:00:00.001Z'),
				store
			})
		).resolves.toMatchObject({ limited: false });
	});

	it('rejects checks without an email dimension', async () => {
		expect(() => checkSignupRateLimit({ email: '   ', store: makeSharedStore() })).toThrow(
			'email is required for signup rate limiting'
		);
	});

	it('uses the Supabase shared durable rate-limit RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: true, retry_after_ms: 1234 }], error: null });
		const store = createSupabaseSignupRateLimitStore({ rpc } as never);

		await expect(
			store.checkBucket({
				key: 'signup:email:hashed',
				windowMs: 60 * 60 * 1000,
				maxRequests: 5,
				now: new Date('2026-06-16T12:00:00.000Z')
			})
		).resolves.toEqual({ limited: true, retryAfterMs: 1234 });
		expect(rpc).toHaveBeenCalledWith('check_durable_rate_limit', {
			p_bucket_key: 'signup:email:hashed',
			p_window_seconds: 3600,
			p_max_requests: 5,
			p_checked_at: '2026-06-16T12:00:00.000Z'
		});
	});
});
