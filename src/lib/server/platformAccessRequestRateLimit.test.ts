import { describe, expect, it, vi } from 'vitest';
import {
	checkPlatformAccessRequestSetupRateLimit,
	createSupabasePlatformAccessRequestRateLimitStore,
	platformAccessRequestRateLimitAuditDetails,
	platformAccessRequestRateLimitMessage,
	type PlatformAccessRequestRateLimitStore
} from './platformAccessRequestRateLimit';

function makeStore(): PlatformAccessRequestRateLimitStore & { keys: string[] } {
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

describe('platform Access Request setup rate limits', () => {
	it('limits approval setup sends by target Access Request before duplicate churn', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(
				checkPlatformAccessRequestSetupRateLimit({
					action: 'approval',
					adminUserId: 'admin-1',
					accessRequestId: 'request-1',
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		await expect(
			checkPlatformAccessRequestSetupRateLimit({
				action: 'approval',
				adminUserId: 'admin-2',
				accessRequestId: 'request-1',
				now,
				store
			})
		).resolves.toMatchObject({
			limited: true,
			retryAfterMs: 15 * 60 * 1000,
			action: 'approval'
		});
		expect(
			store.keys.some((key) => /^platform-access-request-setup-approval-request:request:[a-f0-9]{64}$/.test(key))
		).toBe(true);
		expect(store.keys.join('\n')).not.toContain('request-1');
	});

	it('limits resend setup sends by acting admin without exposing raw identifiers in audit metadata', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 30; attempt += 1) {
			await expect(
				checkPlatformAccessRequestSetupRateLimit({
					action: 'resend',
					adminUserId: 'admin-1',
					accessRequestId: `request-${attempt}`,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkPlatformAccessRequestSetupRateLimit({
			action: 'resend',
			adminUserId: 'admin-1',
			accessRequestId: 'request-31',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			retryAfterMs: 15 * 60 * 1000,
			action: 'resend'
		});
		expect(decision.checks).toHaveLength(1);
		expect(store.keys).toHaveLength(61);
		expect(platformAccessRequestRateLimitAuditDetails(decision)).toMatchObject({
			action: 'resend',
			retryAfterMs: 15 * 60 * 1000,
			checks: expect.arrayContaining([
				expect.objectContaining({
					namespace: 'platform-access-request-setup-resend-admin',
					limitedDimensions: ['admin']
				})
			])
		});
		const stored = store.keys.join('\n');
		expect(stored).not.toContain('admin-1');
		expect(stored).not.toContain('request-31');
		expect(JSON.stringify(platformAccessRequestRateLimitAuditDetails(decision))).not.toContain('/auth/setup-account');
	});

	it('uses the shared durable limiter RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: false, retry_after_ms: 0 }], error: null });
		const store = createSupabasePlatformAccessRequestRateLimitStore({ rpc } as never);

		await expect(
			store.checkBucket({
				key: 'platform-access-request-setup-approval-admin:admin:hashed',
				windowMs: 15 * 60 * 1000,
				maxRequests: 30,
				now: new Date('2026-05-22T12:00:00.000Z')
			})
		).resolves.toEqual({ limited: false });
		expect(rpc).toHaveBeenCalledWith('check_durable_rate_limit', {
			p_bucket_key: 'platform-access-request-setup-approval-admin:admin:hashed',
			p_window_seconds: 900,
			p_max_requests: 30,
			p_checked_at: '2026-05-22T12:00:00.000Z'
		});
	});

	it('provides action-specific admin retry copy and rejects missing required dimensions', async () => {
		expect(platformAccessRequestRateLimitMessage('approval')).toBe(
			'Too many approval setup sends for this Access Request. Please wait before trying again.'
		);
		expect(platformAccessRequestRateLimitMessage('resend')).toBe(
			'Too many setup email resends for this Access Request. Please wait before trying again.'
		);
		await expect(
			checkPlatformAccessRequestSetupRateLimit({
				action: 'approval',
				adminUserId: ' ',
				accessRequestId: 'request-1',
				store: makeStore()
			})
		).rejects.toThrow('adminUserId is required for platform Access Request rate limiting');
		await expect(
			checkPlatformAccessRequestSetupRateLimit({
				action: 'approval',
				adminUserId: 'admin-1',
				accessRequestId: ' ',
				store: makeStore()
			})
		).rejects.toThrow('accessRequestId is required for platform Access Request rate limiting');
	});
});
