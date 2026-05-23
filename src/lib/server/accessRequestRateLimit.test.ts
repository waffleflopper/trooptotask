import { describe, expect, it } from 'vitest';
import { checkAccessRequestSubmissionRateLimit } from './accessRequestRateLimit';
import type { DurableRateLimitStore } from './durableRateLimit';

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

describe('Access Request submission rate limit', () => {
	it('limits public submissions by normalized email and IP using durable buckets', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeSharedStore();

		for (const email of [
			'Soldier@Example.mil',
			'soldier@example.mil',
			' SOLDIER@example.mil ',
			'soldier@example.mil',
			'soldier@example.mil'
		]) {
			await expect(
				checkAccessRequestSubmissionRateLimit({
					email,
					ip: '203.0.113.10',
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		await expect(
			checkAccessRequestSubmissionRateLimit({
				email: 'soldier@example.mil',
				ip: '203.0.113.11',
				now,
				store
			})
		).resolves.toMatchObject({
			limited: true,
			retryAfterMs: 60 * 60 * 1000,
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email']
		});

		expect(new Set(store.keys.filter((key) => key.startsWith('access-request-submission:email:'))).size).toBe(1);
		expect(store.keys.some((key) => key.startsWith('access-request-submission:ip:'))).toBe(true);
		expect(store.keys.join('\n')).not.toContain('soldier@example.mil');
	});
});
