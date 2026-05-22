import { describe, expect, it, vi } from 'vitest';
import {
	type AccountSetupRateLimitStore,
	checkAccountSetupCompletionRateLimit,
	checkAccountSetupRenewalRateLimit,
	createSupabaseAccountSetupRateLimitStore
} from './accountSetupRateLimit';

function makeSharedStore(): AccountSetupRateLimitStore & { keys: string[] } {
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

describe('Account Setup rate limits', () => {
	it('limits fresh-link renewal by normalized email in shared storage', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		await expect(checkAccountSetupRenewalRateLimit({ email: 'Soldier@Example.mil', now, store })).resolves.toEqual({
			limited: false
		});
		await expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toEqual({
			limited: false
		});
		await expect(checkAccountSetupRenewalRateLimit({ email: ' SOLDIER@example.mil ', now, store })).resolves.toEqual({
			limited: false
		});

		await expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});
		expect(new Set(store.keys).size).toBe(1);
		expect(store.keys[0]).toMatch(/^account-setup-renewal:email:[a-f0-9]{64}$/);
	});

	it('allows fresh-link renewal again after the renewal window resets', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toEqual({
				limited: false
			});
		}
		await expect(checkAccountSetupRenewalRateLimit({ email: 'soldier@example.mil', now, store })).resolves.toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});

		await expect(
			checkAccountSetupRenewalRateLimit({
				email: 'soldier@example.mil',
				now: new Date('2026-05-22T13:00:00.001Z'),
				store
			})
		).resolves.toEqual({ limited: false });
	});

	it('limits fresh-link renewal by client address to reduce inbox flooding', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (const email of ['one@example.mil', 'two@example.mil', 'three@example.mil']) {
			await expect(checkAccountSetupRenewalRateLimit({ email, ip: '203.0.113.10', now, store })).resolves.toEqual({
				limited: false
			});
		}

		await expect(
			checkAccountSetupRenewalRateLimit({
				email: 'four@example.mil',
				ip: '203.0.113.10',
				now,
				store
			})
		).resolves.toEqual({
			limited: true,
			retryAfterMs: 60 * 60 * 1000
		});
		expect(store.keys.some((key) => key.startsWith('account-setup-renewal:ip:'))).toBe(true);
	});

	it('limits setup completion attempts by setup link and access request without raw tokens', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await expect(
				checkAccountSetupCompletionRateLimit({
					setupLinkId: 'setup-link-1',
					accessRequestId: 'request-1',
					email: 'soldier@example.mil',
					ip: '203.0.113.10',
					now,
					store
				})
			).resolves.toEqual({ limited: false });
		}

		await expect(
			checkAccountSetupCompletionRateLimit({
				setupLinkId: 'setup-link-1',
				accessRequestId: 'request-1',
				email: 'different@example.mil',
				ip: '203.0.113.11',
				now,
				store
			})
		).resolves.toEqual({
			limited: true,
			retryAfterMs: 15 * 60 * 1000
		});
		expect(store.keys).toContain('account-setup-completion:link:setup-link-1');
		expect(store.keys).toContain('account-setup-completion:request:request-1');
		expect(store.keys.some((key) => key.startsWith('account-setup-completion:email:'))).toBe(true);
		expect(store.keys.some((key) => key.startsWith('account-setup-completion:ip:'))).toBe(true);
		expect(store.keys.join('\n')).not.toContain('raw-token');
	});

	it('limits setup completion attempts even when request email is unavailable', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await expect(
				checkAccountSetupCompletionRateLimit({
					setupLinkId: 'setup-link-1',
					accessRequestId: 'request-1',
					email: null,
					now,
					store
				})
			).resolves.toEqual({ limited: false });
		}

		await expect(
			checkAccountSetupCompletionRateLimit({
				setupLinkId: 'setup-link-1',
				accessRequestId: 'request-1',
				email: null,
				now,
				store
			})
		).resolves.toEqual({
			limited: true,
			retryAfterMs: 15 * 60 * 1000
		});
	});

	it('uses the Supabase shared rate-limit RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: true, retry_after_ms: 1234 }], error: null });
		const store = createSupabaseAccountSetupRateLimitStore({ rpc } as never);

		await expect(
			store.checkBucket({
				key: 'account-setup-renewal:email:hashed',
				windowMs: 60 * 60 * 1000,
				maxRequests: 3,
				now: new Date('2026-05-22T12:00:00.000Z')
			})
		).resolves.toEqual({ limited: true, retryAfterMs: 1234 });
		expect(rpc).toHaveBeenCalledWith('check_account_setup_rate_limit', {
			p_bucket_key: 'account-setup-renewal:email:hashed',
			p_window_seconds: 3600,
			p_max_requests: 3,
			p_checked_at: '2026-05-22T12:00:00.000Z'
		});
	});
});
