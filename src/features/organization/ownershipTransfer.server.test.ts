import { describe, expect, it, vi } from 'vitest';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { transferOrganizationOwnership, type OrganizationOwnershipTransferPort } from './ownershipTransfer.server';

function createOrganizationSettingsAdministrationPort(
	options: {
		organizationName?: string | null;
		lookupOrganizationError?: string | null;
		transferOwnershipError?: string | null;
		transferTargetEmail?: string | null;
		transferTargetRole?: string | null;
		transferTargetUserId?: string | null;
	} = {}
): OrganizationOwnershipTransferPort & {
	transferRequests: Array<{ orgId: string; newOwnerId: string }>;
	transferTargetLookups: Array<{ orgId: string; userId: string }>;
	organizationLookups: string[];
} {
	const transferRequests: Array<{ orgId: string; newOwnerId: string }> = [];
	const transferTargetLookups: Array<{ orgId: string; userId: string }> = [];
	const organizationLookups: string[] = [];

	return {
		transferRequests,
		transferTargetLookups,
		organizationLookups,
		async findOwnershipTransferTarget(orgId, userId) {
			transferTargetLookups.push({ orgId, userId });
			const targetUserId = options.transferTargetUserId === undefined ? userId : options.transferTargetUserId;
			if (targetUserId === null) return null;
			return {
				userId: targetUserId,
				email: options.transferTargetEmail === undefined ? 'new-owner@example.com' : options.transferTargetEmail,
				role: options.transferTargetRole === undefined ? 'member' : options.transferTargetRole
			};
		},
		async transferOwnership(orgId, newOwnerId) {
			transferRequests.push({ orgId, newOwnerId });
			return options.transferOwnershipError ?? null;
		},
		async lookupOrganization(orgId) {
			organizationLookups.push(orgId);
			return {
				name: options.organizationName ?? null,
				errorMessage: options.lookupOrganizationError ?? null
			};
		}
	};
}

describe('ownership-transfer sensitive-action suspension admission', () => {
	it('blocks transfer effects until suspension is verifiably clear', async () => {
		const ctx = createTestContext({ auth: { userId: 'owner-1', orgId: 'org-1', role: 'owner' } });
		const administration = createOrganizationSettingsAdministrationPort({ organizationName: 'Test Org' });
		const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
		const ports = {
			auth: ctx.auth,
			audit: ctx.audit,
			notifications: ctx.notifications,
			administration,
			sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
				authenticatedUserId: 'owner-1',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi
								.fn()
								.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
						}
					},
					rpc
				} as never,
				session: {
					access_token: 'verified-request-token',
					expires_at: 1779454800,
					user: { id: 'owner-1', last_sign_in_at: '2026-05-22T10:00:00Z' }
				} as never,
				now: () => new Date('2026-05-22T12:00:00Z')
			})
		};
		const execute = () =>
			transferOrganizationOwnership(ports, {
				newOwnerId: '11111111-1111-4111-8111-111111111111',
				confirmTransferEmail: 'new-owner@example.com'
			});

		await expect(execute()).rejects.toMatchObject({
			status: 403,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false,
			stepUpPath: null
		});
		expect(administration.transferRequests).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				details: expect.objectContaining({
					sensitiveAction: expect.objectContaining({ reason: 'denied.suspensionStatusUnavailable' })
				}),
				severity: 'warning'
			})
		);

		rpc.mockResolvedValue({ data: false, error: null });
		await expect(execute()).resolves.toEqual({ transferSuccess: true });
		expect(administration.transferRequests).toHaveLength(1);
	});
});

describe('transferOrganizationOwnership', () => {
	it('denies admins before transferring ownership', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.transferRequests).toEqual([]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.transferOwnership',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects invalid target user ids before transfer provider work starts', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ newOwnerId: 'bad-id', confirmTransferEmail: 'new-owner@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invalid user ID'
		});

		expect(port.transferRequests).toEqual([]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('requires the typed confirmation email to match the target member before sensitive authorization', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			transferTargetEmail: 'new-owner@example.com'
		});

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					confirmTransferEmail: 'wrong@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Member email does not match'
		});

		expect(port.transferTargetLookups).toEqual([{ orgId: 'org-1', userId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.transferRequests).toEqual([]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('denies stale-session ownership transfers after governance and before provider mutation', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				userId: 'owner-1'
			},
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				sessionAgeMs: 3_600_000,
				requiresStepUp: true
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
		});

		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([
			{
				action: 'organization.transferOwnership',
				actorUserId: 'owner-1',
				target: { type: 'organization', id: 'org-1' }
			}
		]);
		expect(port.transferRequests).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.ownership_transfer_authorization_denied',
				resourceType: 'organization',
				resourceId: 'org-1',
				details: {
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					sensitiveAction: expect.objectContaining({
						action: 'organization.transferOwnership',
						reason: 'denied.staleSession',
						requiresStepUp: true
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('transfers ownership through the administration boundary, audits it, and notifies the new owner', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Alpha Company'
		});

		const result = await transferOrganizationOwnership(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
		);

		expect(result).toEqual({ transferSuccess: true });
		expect(port.transferRequests).toEqual([
			{
				orgId: 'org-1',
				newOwnerId: '11111111-1111-4111-8111-111111111111'
			}
		]);
		expect(port.organizationLookups).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.ownership_transferred',
				resourceType: 'organization',
				details: {
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					sensitiveAction: expect.objectContaining({
						action: 'organization.transferOwnership',
						reason: 'allowed.recentSession'
					})
				},
				severity: 'critical'
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: '11111111-1111-4111-8111-111111111111',
				notification: {
					type: 'ownership_transferred',
					title: 'Ownership Transferred',
					message: 'You are now the owner of "Alpha Company".',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('transfers ownership when MFA assurance satisfies the sensitive-action check', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				userId: 'owner-1'
			},
			sensitiveActionDecision: {
				reason: 'allowed.mfaAssurance',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2',
				sessionAgeMs: 3_600_000
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Alpha Company'
		});

		const result = await transferOrganizationOwnership(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
		);

		expect(result).toEqual({ transferSuccess: true });
		expect(port.transferRequests).toEqual([
			{
				orgId: 'org-1',
				newOwnerId: '11111111-1111-4111-8111-111111111111'
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.ownership_transferred',
				resourceType: 'organization',
				details: {
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					sensitiveAction: expect.objectContaining({
						action: 'organization.transferOwnership',
						reason: 'allowed.mfaAssurance',
						currentAssuranceLevel: 'aal2'
					})
				},
				severity: 'critical'
			}
		]);
	});

	it('preserves transfer provider failures without auditing or notifying', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			transferOwnershipError: 'transfer failed'
		});

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'transfer failed'
		});

		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('leaves the committed transfer visible when notification delivery fails afterward', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const port = createOrganizationSettingsAdministrationPort({ organizationName: 'Alpha Company' });

		await expect(
			transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: {
						async notifyUser() {
							throw new Error('notification unavailable');
						}
					},
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
			)
		).rejects.toThrow('notification unavailable');

		expect(port.transferRequests).toEqual([{ orgId: 'org-1', newOwnerId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toContainEqual(expect.objectContaining({ action: 'org.ownership_transferred' }));
	});

	it('preserves the current fallback notification copy when the organization name lookup fails after transfer', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			lookupOrganizationError: 'lookup failed',
			organizationName: null
		});

		const result = await transferOrganizationOwnership(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{ newOwnerId: '11111111-1111-4111-8111-111111111111', confirmTransferEmail: 'new-owner@example.com' }
		);

		expect(result).toEqual({ transferSuccess: true });
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: '11111111-1111-4111-8111-111111111111',
				notification: {
					type: 'ownership_transferred',
					title: 'Ownership Transferred',
					message: 'You are now the owner of "the organization".',
					link: '/org/org-1/settings'
				}
			}
		]);
	});
});
