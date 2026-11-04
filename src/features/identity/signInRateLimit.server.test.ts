import { describe, expect, it } from 'vitest';
import type { DurableRateLimitStore } from '$lib/access/index.server';
import { admitSignInAttempt } from './signInRateLimit.server';

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

const now = new Date('2026-11-04T12:00:00Z');

describe('sign-in attempts', () => {
	it('admits ten attempts per account in fifteen minutes from any address, then asks the account to wait', async () => {
		const store = memoryStore();
		for (let attempt = 0; attempt < 10; attempt += 1) {
			expect(await admitSignInAttempt({ email: 'a@example.test', ip: `198.51.100.${attempt}`, now, store })).toEqual({
				status: 'admitted'
			});
		}

		expect(await admitSignInAttempt({ email: 'a@example.test', ip: '203.0.113.9', now, store })).toEqual({
			status: 'limited',
			retryAfterSeconds: 900
		});
		expect(await admitSignInAttempt({ email: 'b@example.test', ip: '203.0.113.9', now, store })).toEqual({
			status: 'admitted'
		});
		const later = new Date(now.getTime() + 900_000);
		expect(await admitSignInAttempt({ email: 'a@example.test', ip: '203.0.113.9', now: later, store })).toEqual({
			status: 'admitted'
		});
	});

	it('shares one account budget across case and whitespace variants', async () => {
		const store = memoryStore();
		const spellings = ['owner@example.test', 'OWNER@example.test', ' Owner@Example.Test '];
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await admitSignInAttempt({ email: spellings[attempt % 3], ip: `198.51.100.${attempt}`, now, store });
		}

		expect(await admitSignInAttempt({ email: ' OWNER@EXAMPLE.TEST', ip: '203.0.113.9', now, store })).toEqual({
			status: 'limited',
			retryAfterSeconds: 900
		});
	});

	it('admits fifty attempts per address across different accounts, then asks the address to wait', async () => {
		const store = memoryStore();
		for (let attempt = 0; attempt < 50; attempt += 1) {
			expect(
				await admitSignInAttempt({ email: `user${attempt}@example.test`, ip: '198.51.100.7', now, store })
			).toEqual({ status: 'admitted' });
		}

		expect(await admitSignInAttempt({ email: 'user50@example.test', ip: '198.51.100.7', now, store })).toEqual({
			status: 'limited',
			retryAfterSeconds: 900
		});
		expect(await admitSignInAttempt({ email: 'user50@example.test', ip: '198.51.100.8', now, store })).toEqual({
			status: 'admitted'
		});
	});

	it('rounds the wait up to whole seconds and reports the longer of the two waits', async () => {
		const store = memoryStore();
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await admitSignInAttempt({ email: 'a@example.test', ip: `198.51.100.${attempt}`, now, store });
		}
		const nearEnd = new Date(now.getTime() + 899_001);

		expect(await admitSignInAttempt({ email: 'a@example.test', ip: '203.0.113.9', now: nearEnd, store })).toEqual({
			status: 'limited',
			retryAfterSeconds: 1
		});
	});

	it('refuses to admit when the limit cannot be read', async () => {
		const store: DurableRateLimitStore = {
			checkBucket: async () => {
				throw new Error('limit store unavailable');
			}
		};

		expect(await admitSignInAttempt({ email: 'a@example.test', ip: '198.51.100.1', now, store })).toEqual({
			status: 'limit-unavailable'
		});
	});
});
