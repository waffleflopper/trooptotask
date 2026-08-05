import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createPlatformAccessRequestAdministration,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type PlatformAccessRequestAdministrationDependencies,
	type PlatformAccessRequestAdministrationStore,
	type PlatformAccessRequestAdminRow
} from './platformAccessRequestAdministration';
import type { AccessRequestInvitationOrigin } from '$lib/server/accessRequestInvitationOrigin';
import type { AccountSetupLinkRecord, CreateAccountSetupLinkResult } from '$lib/server/accountSetupLinks';
import type { SensitiveActionDecision } from '$lib/server/sensitiveActionAuthorizer';

const now = new Date('2026-05-22T12:00:00.000Z');

function makeSetupLink(overrides: Partial<AccessRequestSetupLink> = {}): AccessRequestSetupLink {
	return {
		id: 'link-1',
		created_at: '2026-05-18T13:00:00.000Z',
		expires_at: '2099-06-01T12:00:00.000Z',
		claimed_at: null,
		failed_at: null,
		failure_reason: null,
		used_at: null,
		revoked_at: null,
		revocation_reason: null,
		...overrides
	};
}

function makeOutbox(overrides: Partial<AccessRequestAuthEmailOutbox> = {}): AccessRequestAuthEmailOutbox {
	return {
		id: 'outbox-1',
		setup_link_id: 'link-1',
		status: 'sent',
		attempt_count: 1,
		last_error: null,
		created_at: '2026-05-18T13:01:00.000Z',
		updated_at: '2026-05-18T13:01:00.000Z',
		sent_at: '2026-05-18T13:01:00.000Z',
		...overrides
	};
}

function makeAccessRequestRow(overrides: Partial<PlatformAccessRequestAdminRow> = {}): PlatformAccessRequestAdminRow {
	return {
		id: 'request-1',
		name: 'Test Soldier',
		email: 'soldier@example.mil',
		reason: 'Needs access',
		heard_about: 'other',
		heard_about_details: null,
		status: 'approved',
		created_at: '2026-05-18T12:00:00.000Z',
		reviewed_at: '2026-05-18T13:00:00.000Z',
		reviewed_by: 'platform-admin-1',
		setup_completed_at: null,
		account_setup_links: null,
		auth_email_outbox: null,
		invitation_origins: [],
		...overrides
	};
}

function makeInvitationOrigin(overrides: Partial<AccessRequestInvitationOrigin> = {}): AccessRequestInvitationOrigin {
	return {
		link_id: 'link-1',
		invitation_id: 'invite-1',
		organization_id: 'org-1',
		organization_name: 'Alpha Company',
		inviter_user_id: 'leader-1',
		inviter_email: 'leader@example.mil',
		inviter_label: 'Avery Jones',
		invited_at: '2026-05-18T13:00:00.000Z',
		membership_role: 'member',
		membership_role_label: 'Member',
		member_preset: 'viewer',
		member_preset_label: 'Viewer',
		intended_access_label: 'Member preset: Viewer',
		...overrides
	};
}

function makeSetupRecord(overrides: Partial<AccountSetupLinkRecord> = {}): AccountSetupLinkRecord {
	return {
		id: 'link-1',
		accessRequestId: 'request-1',
		tokenHash: 'hash',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		createdAt: new Date('2026-05-18T13:00:00.000Z'),
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null,
		...overrides
	};
}

function allowedDecision(action = 'platform.accessRequest.approve'): SensitiveActionDecision {
	return {
		allowed: true,
		action: action as SensitiveActionDecision['action'],
		reason: 'allowed.recentSession',
		actorUserId: 'admin-1',
		target: { type: 'access_request', id: 'request-1' },
		currentAssuranceLevel: 'aal1',
		nextAssuranceLevel: 'aal1',
		sessionAgeMs: 60_000,
		recentSessionWindowMs: 900_000,
		requiresStepUp: false
	};
}

function createCreatedSetupResult(
	overrides: Partial<Extract<CreateAccountSetupLinkResult, { status: 'created' }>> = {}
) {
	return {
		status: 'created' as const,
		accessRequestId: 'request-1',
		rawToken: 'raw-token',
		setupPath: '/auth/setup-account?token=raw-token',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		link: makeSetupRecord(),
		revokedLinks: [],
		...overrides
	};
}

function makeStore(
	overrides: Partial<PlatformAccessRequestAdministrationStore> = {}
): PlatformAccessRequestAdministrationStore {
	return {
		listAccessRequests: vi.fn().mockResolvedValue([]),
		getPendingAccessRequestForApproval: vi.fn().mockResolvedValue({
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending',
			setup_completed_at: null
		}),
		markPendingRequestApproved: vi.fn().mockResolvedValue('approved'),
		getApprovedAccessRequestForResend: vi.fn().mockResolvedValue({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setup_completed_at: null
		}),
		rejectPendingAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
			status: 'rejected',
			blockedInvitations: []
		}),
		...overrides
	};
}

function makeDeps(overrides: Partial<PlatformAccessRequestAdministrationDependencies> = {}) {
	const store = makeStore(overrides.store);
	const deps: PlatformAccessRequestAdministrationDependencies = {
		store,
		setupLinks: {
			createForAccessRequest: vi.fn().mockResolvedValue(createCreatedSetupResult())
		},
		setupDelivery: {
			send: vi.fn().mockResolvedValue({
				status: 'sent',
				outbox: { id: 'outbox-1', status: 'sent' }
			})
		},
		sensitiveActionAuthorizer: {
			authorize: vi.fn().mockResolvedValue(allowedDecision())
		},
		checkSetupRateLimit: vi.fn().mockResolvedValue({
			limited: false,
			action: 'approval',
			checks: []
		}),
		audit: vi.fn(),
		notifyGovernors: {
			notifyInvitationBlocked: vi.fn().mockResolvedValue(undefined)
		},
		now: () => now,
		...overrides
	};
	return { deps, admin: createPlatformAccessRequestAdministration(deps) };
}

describe('Platform Access Request Administration', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it('summarizes setup support states without leaking setup-token material', async () => {
		const rows = [
			makeAccessRequestRow({ id: 'not-sent' }),
			makeAccessRequestRow({
				id: 'delivery-pending',
				account_setup_links: [makeSetupLink({ id: 'link-delivery-pending' })],
				auth_email_outbox: [
					makeOutbox({ id: 'outbox-delivery-pending', setup_link_id: 'link-delivery-pending', status: 'pending' })
				]
			}),
			makeAccessRequestRow({
				id: 'delivery-failed',
				account_setup_links: [makeSetupLink({ id: 'link-delivery-failed' })],
				auth_email_outbox: [
					makeOutbox({
						id: 'outbox-delivery-failed',
						setup_link_id: 'link-delivery-failed',
						status: 'failed',
						last_error:
							'mail provider failed https://app.example.test/auth/setup-account?token=secret-token token=secret-token 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
						sent_at: null
					})
				]
			}),
			makeAccessRequestRow({
				id: 'pending',
				account_setup_links: [makeSetupLink({ id: 'link-pending' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-pending' })]
			}),
			makeAccessRequestRow({
				id: 'expired',
				account_setup_links: [makeSetupLink({ id: 'link-expired', expires_at: '2020-06-01T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-expired' })]
			}),
			makeAccessRequestRow({
				id: 'replaced',
				account_setup_links: [
					makeSetupLink({
						id: 'link-replaced',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'replaced'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-replaced' })]
			}),
			makeAccessRequestRow({
				id: 'manual-revoked',
				account_setup_links: [
					makeSetupLink({
						id: 'link-manual-revoked',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'manual'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-manual-revoked' })]
			}),
			makeAccessRequestRow({
				id: 'cleanup-revoked',
				account_setup_links: [
					makeSetupLink({
						id: 'link-cleanup-revoked',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'cleanup'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-cleanup-revoked' })]
			}),
			makeAccessRequestRow({
				id: 'claimed',
				account_setup_links: [makeSetupLink({ id: 'link-claimed', claimed_at: '2026-05-19T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-claimed' })]
			}),
			makeAccessRequestRow({
				id: 'failed',
				account_setup_links: [
					makeSetupLink({
						id: 'link-failed',
						claimed_at: '2026-05-19T12:00:00.000Z',
						failed_at: '2026-05-19T12:05:00.000Z',
						failure_reason: 'account-create-failed'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-failed' })]
			}),
			makeAccessRequestRow({
				id: 'completed',
				setup_completed_at: '2026-05-20T12:00:00.000Z',
				account_setup_links: [makeSetupLink({ id: 'link-completed', used_at: '2026-05-20T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-completed' })]
			})
		];
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue(rows) }) });

		const result = await admin.list({ now });
		const reviewedById = Object.fromEntries(result.reviewed.map((request) => [request.id, request]));

		expect(Object.fromEntries(Object.entries(reviewedById).map(([id, request]) => [id, request.setup_state]))).toEqual({
			'not-sent': 'not_sent',
			'delivery-pending': 'delivery_pending',
			'delivery-failed': 'delivery_failed',
			pending: 'pending',
			expired: 'expired',
			replaced: 'replaced',
			'manual-revoked': 'replaced',
			'cleanup-revoked': 'replaced',
			claimed: 'claimed',
			failed: 'failed',
			completed: 'completed'
		});
		expect(reviewedById['manual-revoked']).toMatchObject({
			setup_state_label: 'Revoked manually',
			setup_link_revocation_reason: 'manual'
		});
		expect(reviewedById['cleanup-revoked']).toMatchObject({
			setup_state_label: 'Revoked by cleanup',
			setup_link_revocation_reason: 'cleanup'
		});
		expect(JSON.stringify(result)).not.toContain('token=secret-token');
		expect(JSON.stringify(result)).not.toContain('secret-token');
		expect(JSON.stringify(result)).not.toContain('/auth/setup-account');
		expect(reviewedById['delivery-failed'].setup_delivery_last_error).toBe(
			'mail provider failed [redacted setup url] token=[redacted] [redacted hash]'
		);
	});

	it('includes organization invitation origin context in the admin list model', async () => {
		const row = makeAccessRequestRow({
			id: 'invite-origin',
			status: 'pending',
			reviewed_by: null,
			invitation_origins: [makeInvitationOrigin()]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.pending[0].invitation_origins).toEqual(row.invitation_origins);
	});

	it('marks an Access Request the inviting Organization admin approved as auto-approved, naming the Organization and inviter', async () => {
		const row = makeAccessRequestRow({
			id: 'auto-approved',
			reviewed_by: 'leader-1',
			invitation_origins: [makeInvitationOrigin({ organization_name: 'Bravo Company', inviter_label: 'Avery Jones' })]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.reviewed[0]).toMatchObject({
			auto_approved: true,
			auto_approval_detail:
				'Auto-approved via invite from Bravo Company. Invited by Avery Jones; no platform admin reviewed this request.'
		});
	});

	it('credits the inviter who actually approved when several Organizations invited the same person', async () => {
		const row = makeAccessRequestRow({
			id: 'multi-origin',
			reviewed_by: 'leader-2',
			invitation_origins: [
				makeInvitationOrigin({
					link_id: 'link-2',
					organization_name: 'Charlie Company',
					inviter_user_id: 'leader-2',
					inviter_label: 'Blake Rivera'
				}),
				makeInvitationOrigin({ organization_name: 'Bravo Company', inviter_label: 'Avery Jones' })
			]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.reviewed[0]).toMatchObject({
			auto_approved: true,
			auto_approval_detail:
				'Auto-approved via invite from Charlie Company. Invited by Blake Rivera; no platform admin reviewed this request.'
		});
	});

	it('credits the Organization whose invite did the approving when one person invited from two', async () => {
		const row = makeAccessRequestRow({
			id: 'same-inviter-two-orgs',
			reviewed_by: 'leader-1',
			reviewed_at: '2026-05-18T13:00:00.000Z',
			invitation_origins: [
				makeInvitationOrigin({
					link_id: 'link-2',
					organization_name: 'Charlie Company',
					invited_at: '2026-05-19T09:00:00.000Z'
				}),
				makeInvitationOrigin({ organization_name: 'Bravo Company', invited_at: '2026-05-18T13:00:00.000Z' })
			]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.reviewed[0].auto_approval_detail).toContain('Auto-approved via invite from Bravo Company');
	});

	it('credits the later invite when the earlier one left the request pending', async () => {
		const row = makeAccessRequestRow({
			id: 'approved-on-second-invite',
			reviewed_by: 'leader-1',
			reviewed_at: '2026-05-19T09:00:01.000Z',
			invitation_origins: [
				makeInvitationOrigin({
					link_id: 'link-2',
					organization_name: 'Charlie Company',
					invited_at: '2026-05-19T09:00:00.000Z'
				}),
				makeInvitationOrigin({ organization_name: 'Bravo Company', invited_at: '2026-05-18T13:00:00.000Z' })
			]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.reviewed[0].auto_approval_detail).toContain('Auto-approved via invite from Charlie Company');
	});

	it('leaves an invite-origin request a platform admin approved by hand unmarked', async () => {
		const row = makeAccessRequestRow({
			id: 'hand-approved',
			reviewed_by: 'platform-admin-1',
			invitation_origins: [makeInvitationOrigin()]
		});
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue([row]) }) });

		const result = await admin.list({ now });

		expect(result.reviewed[0]).toMatchObject({
			auto_approved: false,
			auto_approval_detail: null
		});
	});

	it('leaves an ordinary reviewed request unmarked', async () => {
		const rows = [
			makeAccessRequestRow({ id: 'ordinary-approved' }),
			makeAccessRequestRow({ id: 'rejected', status: 'rejected' })
		];
		const { admin } = makeDeps({ store: makeStore({ listAccessRequests: vi.fn().mockResolvedValue(rows) }) });

		const result = await admin.list({ now });

		expect(result.reviewed.map((request) => request.auto_approved)).toEqual([false, false]);
		expect(result.reviewed.map((request) => request.auto_approval_detail)).toEqual([null, null]);
	});

	it('approves a pending Access Request and delivers an app-owned Account Setup Link without leaking the raw token', async () => {
		const revokedLink = makeSetupRecord({ id: 'link-previous' });
		const { admin, deps } = makeDeps({
			setupLinks: {
				createForAccessRequest: vi.fn().mockResolvedValue(
					createCreatedSetupResult({
						link: makeSetupRecord({ id: 'link-2' }),
						revokedLinks: [revokedLink]
					})
				)
			}
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'sent', setupDeliveryStatus: 'sent' });
		expect(deps.store.markPendingRequestApproved).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			reviewerId: 'admin-1',
			reviewedAt: now
		});
		expect(deps.setupLinks.createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(deps.setupDelivery.send).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			setupLinkId: 'link-2',
			email: 'Soldier@Example.mil',
			setupUrl: 'http://localhost/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-01T12:00:00.000Z')
		});
		expect((deps.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.approved',
			'account_setup.link_revoked',
			'access_request.account_setup_link_sent'
		]);
		const auditPayload = JSON.stringify((deps.audit as ReturnType<typeof vi.fn>).mock.calls);
		expect(auditPayload).toContain('"rateLimit"');
		expect(auditPayload).toContain('"sensitiveAction"');
		expect(auditPayload).not.toContain('raw-token');
		expect(auditPayload).not.toContain('/auth/setup-account');
	});

	it('requires sensitive-action authorization before approval mutation or setup creation', async () => {
		const { admin, deps } = makeDeps({
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue({
					...allowedDecision(),
					allowed: false,
					reason: 'denied.staleSession',
					nextAssuranceLevel: 'aal2',
					requiresStepUp: true
				})
			}
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toMatchObject({
			status: 'authorization_denied',
			failure: {
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});
		expect(deps.store.markPendingRequestApproved).not.toHaveBeenCalled();
		expect(deps.checkSetupRateLimit).not.toHaveBeenCalled();
		expect(deps.setupLinks.createForAccessRequest).not.toHaveBeenCalled();
		expect(deps.setupDelivery.send).not.toHaveBeenCalled();
	});

	it('rate-limits approval before mutation or setup creation', async () => {
		const { admin, deps } = makeDeps({
			checkSetupRateLimit: vi.fn().mockResolvedValue({
				limited: true,
				retryAfterMs: 120_000,
				action: 'approval',
				checks: []
			})
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toMatchObject({
			status: 'rate_limited',
			retryAfterSeconds: 120
		});
		expect(deps.store.markPendingRequestApproved).not.toHaveBeenCalled();
		expect(deps.setupLinks.createForAccessRequest).not.toHaveBeenCalled();
		expect(deps.setupDelivery.send).not.toHaveBeenCalled();
	});

	it('keeps approval complete when setup email delivery fails', async () => {
		const { admin, deps } = makeDeps({
			setupDelivery: {
				send: vi.fn().mockResolvedValue({
					status: 'failed',
					error: 'mail provider unavailable',
					outbox: { id: 'outbox-1', status: 'failed' }
				})
			}
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'delivery_failed', setupDeliveryStatus: 'failed' });
		expect(deps.store.markPendingRequestApproved).toHaveBeenCalled();
		expect((deps.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.approved',
			'access_request.account_setup_link_delivery_failed'
		]);
	});

	it('returns a conflict-like result when setup link creation races', async () => {
		const { admin, deps } = makeDeps({
			setupLinks: {
				createForAccessRequest: vi.fn().mockResolvedValue({ status: 'concurrent-create' })
			}
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'concurrent_create' });
		expect(deps.setupDelivery.send).not.toHaveBeenCalled();
	});

	it('returns a failed approval result when setup creation sees a post-approval state mismatch', async () => {
		const { admin, deps } = makeDeps({
			setupLinks: {
				createForAccessRequest: vi.fn().mockResolvedValue({ status: 'access-request-not-approved' })
			}
		});

		const result = await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'failed' });
		expect(deps.store.markPendingRequestApproved).toHaveBeenCalled();
		expect(deps.setupDelivery.send).not.toHaveBeenCalled();
	});

	it('uses the public app origin for setup links created from the admin host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const { admin, deps } = makeDeps();

		await admin.approve({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'https://admin.trooptotask.org'
		});

		expect(deps.setupDelivery.send).toHaveBeenCalledWith(
			expect.objectContaining({
				setupUrl: 'https://trooptotask.org/auth/setup-account?token=raw-token'
			})
		);
	});

	it('resends setup for an approved incomplete request by replacing older links and sending a fresh setup URL', async () => {
		const { admin, deps } = makeDeps({
			setupLinks: {
				createForAccessRequest: vi.fn().mockResolvedValue(
					createCreatedSetupResult({
						setupPath: '/auth/setup-account?token=fresh-token',
						link: makeSetupRecord({ id: 'link-2' }),
						revokedLinks: [makeSetupRecord({ id: 'link-1' })]
					})
				)
			},
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue(allowedDecision('platform.accessRequest.resendSetup'))
			}
		});

		const result = await admin.resendSetup({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'sent', setupDeliveryStatus: 'sent' });
		expect(deps.store.markPendingRequestApproved).not.toHaveBeenCalled();
		expect(deps.setupLinks.createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(deps.setupDelivery.send).toHaveBeenCalledWith(
			expect.objectContaining({
				setupLinkId: 'link-2',
				setupUrl: 'http://localhost/auth/setup-account?token=fresh-token'
			})
		);
		expect((deps.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'account_setup.link_revoked',
			'access_request.account_setup_link_resent'
		]);
	});

	it('blocks setup resend for completed Access Requests', async () => {
		const { admin, deps } = makeDeps({
			store: makeStore({
				getApprovedAccessRequestForResend: vi.fn().mockResolvedValue({
					id: 'request-1',
					email: 'soldier@example.mil',
					status: 'approved',
					setup_completed_at: '2026-05-20T12:00:00.000Z'
				})
			})
		});

		const result = await admin.resendSetup({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});

		expect(result).toEqual({ status: 'setup_completed' });
		expect(deps.sensitiveActionAuthorizer.authorize).toHaveBeenCalledWith({
			action: 'platform.accessRequest.resendSetup',
			actorUserId: 'admin-1',
			target: { type: 'access_request', id: 'request-1' }
		});
		expect(deps.checkSetupRateLimit).not.toHaveBeenCalled();
		expect(deps.setupLinks.createForAccessRequest).not.toHaveBeenCalled();
		expect(deps.setupDelivery.send).not.toHaveBeenCalled();
	});

	it('rejects pending Access Requests, blocks linked Organization Invitations, and notifies governors best-effort', async () => {
		const { admin, deps } = makeDeps({
			store: makeStore({
				rejectPendingAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
					status: 'rejected',
					blockedInvitations: [
						{
							id: 'invite-1',
							organizationId: 'org-1',
							email: 'invitee@example.com',
							blockedAt: '2026-05-22T12:00:00.000Z'
						}
					]
				})
			})
		});

		const result = await admin.reject({ accessRequestId: 'request-1', actorUserId: 'admin-1' });

		expect(result).toEqual({ status: 'rejected' });
		expect(deps.sensitiveActionAuthorizer.authorize).toHaveBeenCalledWith({
			action: 'platform.accessRequest.reject',
			actorUserId: 'admin-1',
			target: { type: 'access_request', id: 'request-1' }
		});
		expect(deps.store.rejectPendingAccessRequestAndBlockLinkedInvitations).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1'
		});
		expect(deps.notifyGovernors.notifyInvitationBlocked).toHaveBeenCalledWith({
			organizationId: 'org-1',
			adminUserId: 'admin-1',
			email: 'invitee@example.com'
		});
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'access_request.rejected',
				details: { blockedInvitationCount: 1 }
			})
		);
	});

	it('does not log blocked invitation email when governor notification fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const notificationError = new Error('notification unavailable');
		const { admin } = makeDeps({
			store: makeStore({
				rejectPendingAccessRequestAndBlockLinkedInvitations: vi.fn().mockResolvedValue({
					status: 'rejected',
					blockedInvitations: [
						{
							id: 'invite-1',
							organizationId: 'org-1',
							email: 'invitee@example.com',
							blockedAt: '2026-05-22T12:00:00.000Z'
						}
					]
				})
			}),
			notifyGovernors: {
				notifyInvitationBlocked: vi.fn().mockRejectedValue(notificationError)
			}
		});

		try {
			const result = await admin.reject({ accessRequestId: 'request-1', actorUserId: 'admin-1' });

			expect(result).toEqual({ status: 'rejected' });
			expect(consoleError).toHaveBeenCalledWith('[platform-access-request-administration]', {
				status: 'blocked-invitation-notification-failed',
				organizationId: 'org-1',
				invitationId: 'invite-1',
				error: notificationError
			});
			expect(JSON.stringify(consoleError.mock.calls)).not.toContain('invitee@example.com');
		} finally {
			consoleError.mockRestore();
		}
	});

	it('requires sensitive-action authorization before rejecting or blocking linked invitations', async () => {
		const { admin, deps } = makeDeps({
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue({
					...allowedDecision('platform.accessRequest.reject'),
					allowed: false,
					reason: 'denied.staleSession',
					nextAssuranceLevel: 'aal2',
					requiresStepUp: true
				})
			}
		});

		const result = await admin.reject({ accessRequestId: 'request-1', actorUserId: 'admin-1' });

		expect(result).toMatchObject({
			status: 'authorization_denied',
			failure: {
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});
		expect(deps.store.rejectPendingAccessRequestAndBlockLinkedInvitations).not.toHaveBeenCalled();
		expect(deps.notifyGovernors.notifyInvitationBlocked).not.toHaveBeenCalled();
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'access_request.rejection_authorization_denied',
				resourceId: 'request-1',
				severity: 'warning'
			})
		);
	});
});
