import { describe, expect, it } from 'vitest';
import type { DurableRateLimitStore } from '$lib/access/index.server';
import { admitMfaCodeAttempt } from './mfaCodeRateLimit.server';

function memoryStore(): DurableRateLimitStore {
	const buckets = new Map<string, { count: number; resetAt: number }>();
	return {
		async checkBucket({ key, windowMs, maxRequests, now }) {
			const current = buckets.get(key);
			if (!current || current.resetAt <= now.getTime()) {
				buckets.set(key, { count: 1, resetAt: now.getTime() + windowMs });
				return { limited: false };
			}
			current.count += 1;
			return current.count > maxRequests
				? { limited: true, retryAfterMs: current.resetAt - now.getTime() }
				: { limited: false };
		}
	};
}

const now = new Date('2026-10-12T12:00:00Z');

describe('authenticator code attempts', () => {
	it('admits ten codes per account in fifteen minutes, then asks the account to wait', async () => {
		const store = memoryStore();
		for (let attempt = 0; attempt < 10; attempt += 1) {
			expect(await admitMfaCodeAttempt('user-a', { now, store })).toEqual({ status: 'admitted' });
		}

		expect(await admitMfaCodeAttempt('user-a', { now, store })).toEqual({ status: 'limited', retryAfterSeconds: 900 });
		expect(await admitMfaCodeAttempt('user-b', { now, store })).toEqual({ status: 'admitted' });
		expect(await admitMfaCodeAttempt('user-a', { now: new Date(now.getTime() + 900_000), store })).toEqual({
			status: 'admitted'
		});
	});

	it('denies the code when the limit cannot be read', async () => {
		const store: DurableRateLimitStore = {
			checkBucket: async () => {
				throw new Error('limit store unavailable');
			}
		};

		expect(await admitMfaCodeAttempt('user-a', { now, store })).toEqual({ status: 'limit-unavailable' });
	});
});
