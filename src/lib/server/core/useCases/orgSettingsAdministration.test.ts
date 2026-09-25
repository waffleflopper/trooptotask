import { describe, expect, it, vi } from 'vitest';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	clearOrganizationUrlSlug,
	deleteOrganization,
	renameOrganization,
	transferOrganizationOwnership,
	updateOrganizationUrlSlug,
	type OrganizationSettingsAdministrationPort
} from './orgSettingsAdministration';

function createOrganizationSettingsAdministrationPort(
	options: {
		organizationName?: string | null;
		lookupOrganizationError?: string | null;
		renameOrganizationError?: string | null;
		updateOrganizationUrlSlugError?: string | null;
		transferOwnershipError?: string | null;
		transferTargetEmail?: string | null;
		transferTargetRole?: string | null;
		transferTargetUserId?: string | null;
		deleteOrganizationError?: string | null;
		existingSlugOrgId?: string | null;
	} = {}
): OrganizationSettingsAdministrationPort & {
	renameRequests: Array<{ orgId: string; name: string }>;
	slugRequests: Array<{ orgId: string; urlSlug: string | null }>;
	transferRequests: Array<{ orgId: string; newOwnerId: string }>;
	transferTargetLookups: Array<{ orgId: string; userId: string }>;
	slugLookups: string[];
	organizationLookups: string[];
	deletedOrganizations: string[];
} {
	const renameRequests: Array<{ orgId: string; name: string }> = [];
	const slugRequests: Array<{ orgId: string; urlSlug: string | null }> = [];
	const transferRequests: Array<{ orgId: string; newOwnerId: string }> = [];
	const transferTargetLookups: Array<{ orgId: string; userId: string }> = [];
	const slugLookups: string[] = [];
	const organizationLookups: string[] = [];
	const deletedOrganizations: string[] = [];

	return {
		renameRequests,
		slugRequests,
		transferRequests,
		transferTargetLookups,
		slugLookups,
		organizationLookups,
		deletedOrganizations,
		async renameOrganization(orgId, name) {
			renameRequests.push({ orgId, name });
			return options.renameOrganizationError ?? null;
		},
		async updateOrganizationUrlSlug(orgId, urlSlug) {
			slugRequests.push({ orgId, urlSlug });
			return options.updateOrganizationUrlSlugError ?? null;
		},
		async findOrganizationByUrlSlug(urlSlug) {
			slugLookups.push(urlSlug);
			return options.existingSlugOrgId ? { id: options.existingSlugOrgId } : null;
		},
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
		},
		async deleteOrganization(orgId) {
			deletedOrganizations.push(orgId);
			return options.deleteOrganizationError ?? null;
		}
	};
}

describe('Organization sensitive-action suspension admission', () => {
	it.each(['delete', 'transfer'] as const)('blocks %s effects until suspension is verifiably clear', async (action) => {
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
			action === 'delete'
				? deleteOrganization(ports, { confirmName: 'Test Org' })
				: transferOrganizationOwnership(ports, {
						newOwnerId: '11111111-1111-4111-8111-111111111111',
						confirmTransferEmail: 'new-owner@example.com'
					});

		await expect(execute()).rejects.toMatchObject({
			status: 403,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false,
			stepUpPath: null
		});
		expect(administration.deletedOrganizations).toEqual([]);
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
		await expect(execute()).resolves.toEqual(action === 'delete' ? { success: true } : { transferSuccess: true });
		expect(action === 'delete' ? administration.deletedOrganizations : administration.transferRequests).toHaveLength(1);
	});
});

describe('Organization session denial effects', () => {
	it.each([
		['different actor', 'other-user', 1779454800, 'aal2', 'aal2', 'denied.unauthenticated'],
		['expired session', 'owner-1', 1779451200, 'aal2', 'aal2', 'denied.unauthenticated'],
		['MFA pending', 'owner-1', 1779454800, 'aal1', 'aal2', 'denied.staleSession'],
		['unavailable assurance', 'owner-1', 1779454800, null, null, 'denied.assuranceUnavailable']
	])(
		'preserves Organization on %s and permits a valid retry',
		async (_label, userId, expiresAt, currentLevel, nextLevel, reason) => {
			const ctx = createTestContext({ auth: { userId: 'owner-1', orgId: 'org-1', role: 'owner' } });
			const administration = createOrganizationSettingsAdministrationPort({ organizationName: 'Test Org' });
			const session = { access_token: 'verified-token', expires_at: expiresAt, user: { id: userId } };
			const assurance = vi.fn().mockResolvedValue({
				data: {
					currentLevel,
					nextLevel,
					currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
				},
				error: null
			});
			const ports = {
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration,
				sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
					authenticatedUserId: 'owner-1',
					session: session as never,
					supabase: {
						auth: { mfa: { getAuthenticatorAssuranceLevel: assurance } },
						rpc: vi.fn().mockResolvedValue({ data: false, error: null })
					} as never,
					now: () => new Date('2026-05-22T12:00:00Z')
				})
			};
			const execute = () => deleteOrganization(ports, { confirmName: 'Test Org' });
			await expect(execute()).rejects.toMatchObject({ status: 403, reason });
			expect(administration.deletedOrganizations).toEqual([]);
			expect(ctx.notificationPort.notifications).toEqual([]);
			expect(ctx.auditPort.events.some((event) => event.action === 'org.deleted')).toBe(false);
			session.user.id = 'owner-1';
			session.expires_at = 1779454800;
			assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
			await expect(execute()).resolves.toEqual({ success: true });
			expect(administration.deletedOrganizations).toEqual(['org-1']);
		}
	);
});

describe('renameOrganization', () => {
	it('denies high-access members who are not admin or owner before renaming organizations', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'member'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: 'Alpha Company' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.renameRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.rename',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('normalizes the organization name before persisting and auditing', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await renameOrganization(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ name: '  Alpha   Company  ' }
		);

		expect(result).toEqual({ nameSuccess: true });
		expect(port.renameRequests).toEqual([{ orgId: 'org-1', name: 'Alpha Company' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.renamed',
				resourceType: 'organization',
				details: { name: 'Alpha Company' }
			}
		]);
	});

	it('rejects empty organization names before provider work starts', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: '   ' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name is required'
		});

		expect(port.renameRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves provider failures without auditing', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			renameOrganizationError: 'rename failed'
		});

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: 'Alpha Company' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'rename failed'
		});

		expect(ctx.auditPort.events).toEqual([]);
	});
});

describe('updateOrganizationUrlSlug', () => {
	it('normalizes, persists, and audits organization URL slugs', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await updateOrganizationUrlSlug(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ urlSlug: '  1-11-BDE  ' }
		);

		expect(result).toEqual({ slugSuccess: true, orgUrlSlug: '1-11-bde' });
		expect(port.slugLookups).toEqual(['1-11-bde']);
		expect(port.slugRequests).toEqual([{ orgId: 'org-1', urlSlug: '1-11-bde' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.url_slug_updated',
				resourceType: 'organization',
				details: { urlSlug: '1-11-bde' }
			}
		]);
	});

	it('rejects duplicate organization URL slugs before writing', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({ existingSlugOrgId: 'org-2' });

		await expect(
			updateOrganizationUrlSlug(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ urlSlug: '1-11-bde' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization URL slug is already in use'
		});

		expect(port.slugRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('clears organization URL slugs through the same governance policy', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await clearOrganizationUrlSlug({
			auth: ctx.auth,
			audit: ctx.audit,
			notifications: ctx.notifications,
			administration: port
		});

		expect(result).toEqual({ slugSuccess: true, orgUrlSlug: null });
		expect(port.slugRequests).toEqual([{ orgId: 'org-1', urlSlug: null }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.url_slug_cleared',
				resourceType: 'organization'
			}
		]);
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

describe('deleteOrganization', () => {
	it('denies admins before deleting organizations', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org'
		});

		await expect(
			deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.organizationLookups).toEqual([]);
		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.deleteOrganization',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('normalizes the confirmation name before deleting and records the destructive audit event', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test   Org'
		});

		const result = await deleteOrganization(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{ confirmName: '  Test Org  ' }
		);

		expect(result).toEqual({ success: true });
		expect(port.organizationLookups).toEqual(['org-1']);
		expect(port.deletedOrganizations).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.deleted',
				resourceType: 'organization',
				details: {
					sensitiveAction: expect.objectContaining({
						action: 'organization.deleteOrganization',
						reason: 'allowed.recentSession'
					})
				},
				severity: 'critical'
			}
		]);
	});

	it('deletes organizations when MFA assurance satisfies the sensitive-action check', async () => {
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
			organizationName: 'Test Org'
		});

		const result = await deleteOrganization(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				administration: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{ confirmName: 'Test Org' }
		);

		expect(result).toEqual({ success: true });
		expect(port.deletedOrganizations).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.deleted',
				resourceType: 'organization',
				details: {
					sensitiveAction: expect.objectContaining({
						action: 'organization.deleteOrganization',
						reason: 'allowed.mfaAssurance',
						currentAssuranceLevel: 'aal2'
					})
				},
				severity: 'critical'
			}
		]);
	});

	it('returns the current mismatch failure without deleting the organization', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org'
		});

		await expect(
			deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ confirmName: 'Other Org' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name does not match'
		});

		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('denies stale-session organization deletion after confirmation and before deleting', async () => {
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
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org'
		});

		await expect(
			deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
		});

		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([
			{
				action: 'organization.deleteOrganization',
				actorUserId: 'owner-1',
				target: { type: 'organization', id: 'org-1' }
			}
		]);
		expect(port.organizationLookups).toEqual(['org-1']);
		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.delete_authorization_denied',
				resourceType: 'organization',
				resourceId: 'org-1',
				details: {
					sensitiveAction: expect.objectContaining({
						action: 'organization.deleteOrganization',
						reason: 'denied.staleSession',
						requiresStepUp: true
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('preserves organization lookup failures before the destructive step', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			lookupOrganizationError: 'lookup failed'
		});

		await expect(
			deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'lookup failed'
		});

		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves delete provider failures without emitting the destructive audit event', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org',
			deleteOrganizationError: 'delete failed'
		});

		await expect(
			deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'delete failed'
		});

		expect(port.deletedOrganizations).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([]);
	});
});
