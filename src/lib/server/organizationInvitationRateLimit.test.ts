import { describe, expect, it, vi } from 'vitest';
import {
	checkOrganizationInvitationRateLimit,
	createSupabaseOrganizationInvitationRateLimitStore,
	organizationInvitationRateLimitAuditDetails,
	organizationInvitationRateLimitMessage,
	type OrganizationInvitationRateLimitStore
} from './organizationInvitationRateLimit';

function makeStore(): OrganizationInvitationRateLimitStore & { keys: string[] } {
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

describe('organization invitation rate limits', () => {
	it('limits invitation creation by normalized recipient email without exposing raw identifiers', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(
				checkOrganizationInvitationRateLimit({
					action: 'create',
					actorUserId: `actor-${attempt}`,
					organizationId: `org-${attempt}`,
					recipientEmail: ' Soldier@Example.Mil ',
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkOrganizationInvitationRateLimit({
			action: 'create',
			actorUserId: 'actor-4',
			organizationId: 'org-4',
			recipientEmail: 'soldier@example.mil',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			retryAfterMs: 15 * 60 * 1000,
			action: 'create'
		});
		expect(organizationInvitationRateLimitAuditDetails(decision)).toMatchObject({
			action: 'create',
			retryAfterMs: 15 * 60 * 1000,
			checks: expect.arrayContaining([
				expect.objectContaining({
					namespace: 'organization-invitation-create-recipient',
					limitedDimensions: ['recipient']
				})
			])
		});
		const stored = store.keys.join('\n');
		expect(stored).not.toContain('Soldier@Example.Mil');
		expect(stored).not.toContain('soldier@example.mil');
		expect(stored).not.toContain('actor-4');
		expect(stored).not.toContain('org-4');
	});

	it('limits invitation creation by acting user and short-circuits later buckets', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 30; attempt += 1) {
			await expect(
				checkOrganizationInvitationRateLimit({
					action: 'create',
					actorUserId: 'actor-1',
					organizationId: `org-${attempt}`,
					recipientEmail: `invitee-${attempt}@example.mil`,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkOrganizationInvitationRateLimit({
			action: 'create',
			actorUserId: 'actor-1',
			organizationId: 'org-31',
			recipientEmail: 'invitee-31@example.mil',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			action: 'create',
			retryAfterMs: 15 * 60 * 1000
		});
		expect(decision.checks).toHaveLength(1);
		expect(decision.checks[0]).toMatchObject({
			namespace: 'organization-invitation-create-actor',
			limitedDimensions: ['actor']
		});
	});

	it('limits invitation creation by organization across different actors and recipients', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 100; attempt += 1) {
			await expect(
				checkOrganizationInvitationRateLimit({
					action: 'create',
					actorUserId: `actor-${attempt}`,
					organizationId: 'org-1',
					recipientEmail: `invitee-${attempt}@example.mil`,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkOrganizationInvitationRateLimit({
			action: 'create',
			actorUserId: 'actor-101',
			organizationId: 'org-1',
			recipientEmail: 'invitee-101@example.mil',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			action: 'create',
			retryAfterMs: 15 * 60 * 1000
		});
		expect(decision.checks).toHaveLength(2);
		expect(decision.checks[1]).toMatchObject({
			namespace: 'organization-invitation-create-organization',
			limitedDimensions: ['organization']
		});
	});

	it('limits invitation resend by invitation identity before enqueueing repeated sends', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const store = makeStore();

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(
				checkOrganizationInvitationRateLimit({
					action: 'resend',
					actorUserId: `actor-${attempt}`,
					organizationId: `org-${attempt}`,
					invitationId: 'invite-1',
					recipientEmail: `invitee-${attempt}@example.mil`,
					now,
					store
				})
			).resolves.toMatchObject({ limited: false });
		}

		const decision = await checkOrganizationInvitationRateLimit({
			action: 'resend',
			actorUserId: 'actor-4',
			organizationId: 'org-4',
			invitationId: 'invite-1',
			recipientEmail: 'invitee-4@example.mil',
			now,
			store
		});

		expect(decision).toMatchObject({
			limited: true,
			action: 'resend',
			retryAfterMs: 15 * 60 * 1000
		});
		expect(decision.checks).toHaveLength(3);
		expect(decision.checks[2]).toMatchObject({
			namespace: 'organization-invitation-resend-invitation',
			limitedDimensions: ['invitation']
		});
		expect(store.keys.join('\n')).not.toContain('invite-1');
	});

	it('limits invitation resend by recipient, actor, and organization dimensions', async () => {
		const now = new Date('2026-05-22T12:00:00.000Z');
		const recipientStore = makeStore();
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: `actor-${attempt}`,
				organizationId: `org-${attempt}`,
				invitationId: `invite-${attempt}`,
				recipientEmail: 'repeat@example.mil',
				now,
				store: recipientStore
			});
		}
		await expect(
			checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: 'actor-4',
				organizationId: 'org-4',
				invitationId: 'invite-4',
				recipientEmail: ' Repeat@Example.Mil ',
				now,
				store: recipientStore
			})
		).resolves.toMatchObject({
			limited: true,
			action: 'resend',
			checks: expect.arrayContaining([
				expect.objectContaining({
					namespace: 'organization-invitation-resend-recipient',
					limitedDimensions: ['recipient']
				})
			])
		});

		const actorStore = makeStore();
		for (let attempt = 0; attempt < 30; attempt += 1) {
			await checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: 'actor-1',
				organizationId: `org-${attempt}`,
				invitationId: `invite-${attempt}`,
				recipientEmail: `invitee-${attempt}@example.mil`,
				now,
				store: actorStore
			});
		}
		await expect(
			checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: 'actor-1',
				organizationId: 'org-31',
				invitationId: 'invite-31',
				recipientEmail: 'invitee-31@example.mil',
				now,
				store: actorStore
			})
		).resolves.toMatchObject({
			limited: true,
			checks: [expect.objectContaining({ namespace: 'organization-invitation-resend-actor' })]
		});

		const organizationStore = makeStore();
		for (let attempt = 0; attempt < 100; attempt += 1) {
			await checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: `actor-${attempt}`,
				organizationId: 'org-1',
				invitationId: `invite-${attempt}`,
				recipientEmail: `invitee-${attempt}@example.mil`,
				now,
				store: organizationStore
			});
		}
		await expect(
			checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: 'actor-101',
				organizationId: 'org-1',
				invitationId: 'invite-101',
				recipientEmail: 'invitee-101@example.mil',
				now,
				store: organizationStore
			})
		).resolves.toMatchObject({
			limited: true,
			checks: expect.arrayContaining([
				expect.objectContaining({ namespace: 'organization-invitation-resend-organization' })
			])
		});
	});

	it('uses the shared durable limiter RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: [{ limited: false, retry_after_ms: 0 }], error: null });
		const store = createSupabaseOrganizationInvitationRateLimitStore({ rpc } as never);

		await expect(
			store.checkBucket({
				key: 'organization-invitation-create-recipient:recipient:hashed',
				windowMs: 15 * 60 * 1000,
				maxRequests: 3,
				now: new Date('2026-05-22T12:00:00.000Z')
			})
		).resolves.toEqual({ limited: false });
		expect(rpc).toHaveBeenCalledWith('check_durable_rate_limit', {
			p_bucket_key: 'organization-invitation-create-recipient:recipient:hashed',
			p_window_seconds: 900,
			p_max_requests: 3,
			p_checked_at: '2026-05-22T12:00:00.000Z'
		});
	});

	it('provides retry copy and rejects missing required dimensions', async () => {
		expect(organizationInvitationRateLimitMessage('create')).toBe(
			'Too many organization invitation attempts. Please wait before inviting this recipient again.'
		);
		expect(organizationInvitationRateLimitMessage('resend', 61_000)).toBe(
			'Too many organization invitation resend attempts. Please wait before trying again. Try again in about 2 minutes.'
		);
		await expect(
			checkOrganizationInvitationRateLimit({
				action: 'create',
				actorUserId: ' ',
				organizationId: 'org-1',
				recipientEmail: 'invitee@example.mil',
				store: makeStore()
			})
		).rejects.toThrow('actorUserId is required for organization invitation rate limiting');
		await expect(
			checkOrganizationInvitationRateLimit({
				action: 'resend',
				actorUserId: 'actor-1',
				organizationId: 'org-1',
				recipientEmail: 'invitee@example.mil',
				invitationId: ' ',
				store: makeStore()
			})
		).rejects.toThrow('invitationId is required for organization invitation rate limiting');
	});
});
