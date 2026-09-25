import { describe, expect, it, vi } from 'vitest';
import { checkForgotPasswordRateLimit } from './forgotPasswordRateLimit';
import { checkOrganizationInvitationRateLimit } from './organizationInvitationRateLimit';
import { checkPlatformAccessRequestSetupRateLimit } from './platformAccessRequestRateLimit';
import { createSupabaseDurableRateLimitStore, type DurableRateLimitStore } from './durableRateLimit';

const now = new Date('2026-09-17T12:00:00Z');
const identity = { email: ' Synthetic@Example.test ', ip: '192.0.2.1', now };
type Policy = {
	name: string;
	check: (store: DurableRateLimitStore) => Promise<{ limited: boolean; retryAfterMs?: number }>;
	// Independently retained abuse budgets: [window seconds, maximum attempts] per dimension.
	budgets: [number, number][];
};
const policies: Policy[] = [
	{
		name: 'password recovery',
		check: (store) => checkForgotPasswordRateLimit({ ...identity, store }),
		budgets: [
			[3600, 3],
			[3600, 3]
		]
	},
	...(['create', 'resend'] as const).map(
		(action): Policy => ({
			name: `Organization invitation ${action}`,
			check: (store) =>
				checkOrganizationInvitationRateLimit({
					action,
					actorUserId: 'synthetic-user',
					organizationId: 'synthetic-org',
					recipientEmail: identity.email,
					invitationId: 'synthetic-invitation',
					now,
					store
				}),
			budgets:
				action === 'create'
					? [
							[900, 30],
							[900, 100],
							[900, 3]
						]
					: [
							[900, 30],
							[900, 100],
							[900, 3],
							[900, 3]
						]
		})
	),
	...(['approval', 'resend'] as const).map(
		(action): Policy => ({
			name: `platform setup ${action}`,
			check: (store) =>
				checkPlatformAccessRequestSetupRateLimit({
					action,
					adminUserId: 'synthetic-user',
					accessRequestId: 'synthetic-request',
					now,
					store
				}),
			budgets: [
				[900, 30],
				[900, 3]
			]
		})
	)
];

describe('durable limiter policy consumers', () => {
	it.each(policies)(
		'$name retains its budgets and accepts only a valid provider decision',
		async ({ check, budgets }) => {
			const rpc = vi.fn().mockResolvedValue({ data: [{ limited: false, retry_after_ms: 900_000 }], error: null });
			const store = createSupabaseDurableRateLimitStore({ rpc } as never);
			await expect(check(store)).resolves.toMatchObject({ limited: false });
			expect(rpc.mock.calls.map(([, input]) => [input.p_window_seconds, input.p_max_requests])).toEqual(budgets);
			for (const [, input] of rpc.mock.calls) {
				expect(input.p_checked_at).toBe('2026-09-17T12:00:00.000Z');
				expect(input.p_bucket_key).toMatch(/:[a-f0-9]{64}$/);
				expect(input.p_bucket_key).not.toMatch(/synthetic|192\.0\.2\.1/i);
			}

			rpc.mockResolvedValue({ data: [{ limited: true, retry_after_ms: 1500 }], error: null });
			await expect(check(store)).resolves.toMatchObject({ limited: true, retryAfterMs: 1500 });
			rpc.mockResolvedValue({ data: [{}], error: null });
			await expect(check(store)).rejects.toThrow();
			const failure = new Error('synthetic RPC failure');
			rpc.mockResolvedValue({ data: [{ limited: false, retry_after_ms: 0 }], error: failure });
			await expect(check(store)).rejects.toBe(failure);
		}
	);

	it('shares normalized identities within a policy and partitions separate actors', async () => {
		const keys: string[] = [];
		const store = createSupabaseDurableRateLimitStore({
			rpc: async (_name: string, input: { p_bucket_key: string }) => {
				keys.push(input.p_bucket_key);
				return { data: [{ limited: false, retry_after_ms: 900_000 }], error: null };
			}
		} as never);
		await checkForgotPasswordRateLimit({ email: ' Synthetic@Example.test ', now, store });
		await checkForgotPasswordRateLimit({ email: 'synthetic@example.test', now, store });
		await checkForgotPasswordRateLimit({ email: 'other@example.test', now, store });
		expect(keys[0]).toBe(keys[1]);
		expect(keys[2]).not.toBe(keys[0]);
	});
});
