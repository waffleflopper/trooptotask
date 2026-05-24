import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	createFakeOrganizationInvitationDeliveryPort as createInvitationDeliveryPort,
	createFakeOrganizationInvitationRateLimiter as createInvitationRateLimiter,
	memberAccessFixture as memberAccess
} from '$lib/test-support/authWorkflowFixtures';
import type { OrganizationMemberPermissions } from '$lib/types';
import {
	inviteOrganizationMember as inviteOrganizationMemberUseCase,
	leaveOrganization,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions,
	type OrganizationInvitationAccessRequestBridgeInput,
	type OrganizationInvitationCreateInput,
	type OrganizationMembershipUpdateInput,
	type OrganizationSettingsMemberManagementPort
} from './orgSettingsMemberManagement';
import { readOrganizationPlanUsage, type OrganizationPlanUsage } from './organizationPlanUsage';
import type { EffectivePlanPolicy } from './planPolicy';

function buildPermissions(overrides: Partial<OrganizationMemberPermissions> = {}): OrganizationMemberPermissions {
	return {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: true,
		canEditCriticalTasks: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewRatingScheme: true,
		canEditRatingScheme: true,
		canManageMembers: false,
		...overrides
	};
}

function createOrganizationSettingsMemberManagementPort(
	options: {
		existingInvitationId?: string | null;
		createInvitationError?: string | null;
		existingUserAccount?: { id: string; email: string } | null;
		accessRequestBridgeResult?:
			| { status: 'created' | 'linked' | 'already-linked'; accessRequestId: string }
			| { status: 'failed'; message: string }
			| null;
		revokeInvitationResult?: {
			status: 'revoked' | 'not_found' | 'expired' | 'already_accepted' | 'already_declined' | 'failed';
			email: string | null;
		};
		pendingInvitationById?: { id: string; email: string } | null;
		pendingInvitationByIdStatus?: 'pending' | 'expired';
		pendingInvitationRequiresAccountSetup?: boolean;
		blockInvitationResult?: { status: 'blocked' } | { status: 'failed'; message: string };
		membership?: {
			userId: string | null;
			role: string | null;
			email: string | null;
			canManageMembers?: boolean | null;
		} | null;
		removeMembershipError?: string | null;
		updateMembershipError?: string | null;
		orgName?: string | null;
	} = {}
): OrganizationSettingsMemberManagementPort & {
	invitationLookups: Array<{ orgId: string; email: string }>;
	userAccountLookups: string[];
	createdInvitations: OrganizationInvitationCreateInput[];
	accessRequestBridges: OrganizationInvitationAccessRequestBridgeInput[];
	blockedInvitations: Array<{ organizationId: string; invitationId: string; blockedBy: string; reason: string }>;
	revokedInvitations: Array<{ orgId: string; inviteId: string }>;
	pendingInvitationByIdLookups: Array<{ orgId: string; inviteId: string }>;
	membershipLookups: Array<{ orgId: string; membershipId: string }>;
	removedMemberships: Array<{ orgId: string; membershipId: string }>;
	updatedMemberships: OrganizationMembershipUpdateInput[];
} {
	const invitationLookups: Array<{ orgId: string; email: string }> = [];
	const userAccountLookups: string[] = [];
	const createdInvitations: OrganizationInvitationCreateInput[] = [];
	const accessRequestBridges: OrganizationInvitationAccessRequestBridgeInput[] = [];
	const blockedInvitations: Array<{ organizationId: string; invitationId: string; blockedBy: string; reason: string }> =
		[];
	const revokedInvitations: Array<{ orgId: string; inviteId: string }> = [];
	const pendingInvitationByIdLookups: Array<{ orgId: string; inviteId: string }> = [];
	const membershipLookups: Array<{ orgId: string; membershipId: string }> = [];
	const removedMemberships: Array<{ orgId: string; membershipId: string }> = [];
	const updatedMemberships: OrganizationMembershipUpdateInput[] = [];

	return {
		invitationLookups,
		userAccountLookups,
		createdInvitations,
		accessRequestBridges,
		blockedInvitations,
		revokedInvitations,
		pendingInvitationByIdLookups,
		membershipLookups,
		removedMemberships,
		updatedMemberships,
		async findPendingInvitation(orgId, email) {
			invitationLookups.push({ orgId, email });
			return options.existingInvitationId ? { id: options.existingInvitationId } : null;
		},
		async findPendingInvitationById(orgId, inviteId) {
			pendingInvitationByIdLookups.push({ orgId, inviteId });
			const invitation =
				options.pendingInvitationById === undefined
					? { id: inviteId, email: 'invitee@example.com' }
					: options.pendingInvitationById;
			return invitation
				? {
						...invitation,
						status: options.pendingInvitationByIdStatus ?? 'pending',
						requiresAccountSetup: options.pendingInvitationRequiresAccountSetup ?? false
					}
				: null;
		},
		async findUserAccountByEmail(email) {
			userAccountLookups.push(email);
			return options.existingUserAccount === undefined ? { id: 'user-1', email } : options.existingUserAccount;
		},
		async createInvitation(input) {
			createdInvitations.push(input);
			return options.createInvitationError
				? { status: 'failed', message: options.createInvitationError }
				: {
						status: 'created',
						invitationId: 'invite-created',
						createdAt: '2026-05-22T12:00:00.000Z'
					};
		},
		async createOrLinkPendingAccessRequestForInvitation(input) {
			accessRequestBridges.push(input);
			return options.accessRequestBridgeResult ?? { status: 'created', accessRequestId: 'access-request-1' };
		},
		async blockInvitationAfterAccessRequestBridgeFailure(input) {
			blockedInvitations.push(input);
			return options.blockInvitationResult ?? { status: 'blocked' };
		},
		async revokeInvitation(orgId, inviteId) {
			revokedInvitations.push({ orgId, inviteId });
			return options.revokeInvitationResult ?? { status: 'revoked', email: 'invitee@example.com' };
		},
		async findMembershipById(orgId, membershipId) {
			membershipLookups.push({ orgId, membershipId });
			return options.membership
				? { ...options.membership, canManageMembers: options.membership.canManageMembers ?? null }
				: null;
		},
		async removeMembership(orgId, membershipId) {
			removedMemberships.push({ orgId, membershipId });
			return options.removeMembershipError ?? null;
		},
		async updateMembership(input) {
			updatedMemberships.push(input);
			return options.updateMembershipError ?? null;
		},
		async getOrganizationName() {
			return options.orgName ?? null;
		}
	};
}

function createPlanPolicyPort(input: {
	plan?: 'free' | 'team' | 'unit';
	memberLimit?: number | null;
	activeOrganizationMemberCount: number;
	pendingUnexpiredInvitationCount: number;
}): {
	readEffectivePlanPolicy: ReturnType<typeof vi.fn<() => Promise<EffectivePlanPolicy>>>;
	readOrganizationPlanUsage: ReturnType<typeof vi.fn<() => Promise<OrganizationPlanUsage>>>;
} {
	const plan = input.plan ?? 'free';
	const memberLimit = input.memberLimit === undefined ? 2 : input.memberLimit;
	return {
		readEffectivePlanPolicy: vi.fn(async () => {
			return {
				organizationId: 'org-1',
				commercialPlan: plan,
				tier: plan,
				source: 'billing_snapshot',
				billingSource: 'stripe',
				giftTier: null,
				giftExpiresAt: null,
				limits: {
					activePersonnel: {
						limit: 20,
						enforcement: 'hard_cap',
						denialCode: 'denied.personnel_limit',
						upgradeTarget: 'team'
					},
					activeOrganizationMembers: {
						limit: memberLimit,
						enforcement: 'active_members_plus_pending_invitations',
						denialCode: 'denied.member_limit',
						upgradeTarget: plan === 'unit' ? null : 'team'
					},
					pendingInvitations: {
						limit: memberLimit,
						enforcement: 'active_members_plus_pending_invitations',
						denialCode: 'denied.pending_invitation_limit',
						upgradeTarget: plan === 'unit' ? null : 'team',
						countsTowardMemberLimit: true,
						excludedStatuses: ['expired', 'declined', 'revoked', 'blocked', 'accepted']
					},
					ownedOrganizations: {
						limit: 1,
						enforcement: 'hard_cap',
						denialCode: 'denied.organization_ownership_limit',
						upgradeTarget: 'unit'
					}
				},
				exportQuota: {
					limit: 3,
					unlimited: false,
					period: 'calendar_month',
					denialCode: 'denied.export_quota',
					upgradeTarget: 'team'
				},
				entitlements: {
					bulk_export_unlimited: {
						key: 'bulk_export_unlimited',
						available: plan !== 'free',
						source: 'base_plan',
						upgradeTarget: plan === 'free' ? 'team' : null
					},
					advanced_reporting: {
						key: 'advanced_reporting',
						available: plan === 'unit',
						source: 'base_plan',
						upgradeTarget: plan === 'unit' ? null : 'unit'
					}
				},
				grace: { mode: 'none', message: null },
				readOnly: { enabled: false, reasons: [] }
			};
		}),
		readOrganizationPlanUsage: vi.fn(async () => {
			return {
				organizationId: 'org-1',
				asOf: '2026-05-24T12:00:00.000Z',
				activePersonnelCount: 0,
				activeOrganizationMemberCount: input.activeOrganizationMemberCount,
				pendingUnexpiredInvitationCount: input.pendingUnexpiredInvitationCount,
				monthlyExportCount: 0,
				sources: {
					activePersonnel: { table: 'personnel', included: [], excluded: [] },
					activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: [] },
					pendingUnexpiredInvitations: { table: 'organization_invitations', included: [], excluded: [] },
					monthlyExports: {
						table: 'data_exports',
						included: [],
						excluded: [],
						period: { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' }
					}
				}
			};
		})
	};
}

const createUnlimitedPlanPolicy = () =>
	createPlanPolicyPort({
		plan: 'unit',
		memberLimit: null,
		activeOrganizationMemberCount: 0,
		pendingUnexpiredInvitationCount: 0
	});

const inviteOrganizationMember = (
	ports: Record<string, unknown>,
	input: Parameters<typeof inviteOrganizationMemberUseCase>[1]
) =>
	inviteOrganizationMemberUseCase(
		{
			planPolicy: createUnlimitedPlanPolicy(),
			...ports
		} as unknown as Parameters<typeof inviteOrganizationMemberUseCase>[0],
		input
	);

describe('inviteOrganizationMember', () => {
	it('blocks direct member invites when active members already fill the free plan member cap', async () => {
		const ctx = createTestContext({ auth: { userId: 'actor-1', orgId: 'org-1', role: 'admin' } });
		const port = createOrganizationSettingsMemberManagementPort();
		const planPolicy = createPlanPolicyPort({
			plan: 'free',
			memberLimit: 2,
			activeOrganizationMemberCount: 2,
			pendingUnexpiredInvitationCount: 0
		});

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					planPolicy
				},
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'admin@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message:
				'This organization has reached its plan member limit of 2 active members. Remove a member or upgrade before inviting another member.'
		});

		expect(port.createdInvitations).toEqual([]);
		expect(port.userAccountLookups).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.invite_plan_limit_denied',
				details: expect.objectContaining({
					commercialPlan: 'free',
					memberLimit: 2,
					activeOrganizationMemberCount: 2,
					pendingUnexpiredInvitationCount: 0,
					reason: 'active_members'
				})
			})
		);
	});

	it('blocks direct member invites when active members plus pending invitations fill the free plan cap', async () => {
		const ctx = createTestContext({ auth: { userId: 'actor-1', orgId: 'org-1', role: 'admin' } });
		const port = createOrganizationSettingsMemberManagementPort();
		const planPolicy = createPlanPolicyPort({
			plan: 'free',
			memberLimit: 2,
			activeOrganizationMemberCount: 1,
			pendingUnexpiredInvitationCount: 1
		});

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					planPolicy
				},
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'admin@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message:
				'This organization has reached its plan member limit of 2 seats when pending invitations are included. Revoke a pending invitation or upgrade before inviting another member.'
		});

		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.invite_plan_limit_denied',
				details: expect.objectContaining({
					reason: 'pending_invitations'
				})
			})
		);
	});

	it('allows paid-plan member invites when usage remains under the member cap', async () => {
		const ctx = createTestContext({ auth: { userId: 'actor-1', orgId: 'org-1', role: 'admin' } });
		const port = createOrganizationSettingsMemberManagementPort();
		const planPolicy = createPlanPolicyPort({
			plan: 'team',
			memberLimit: 10,
			activeOrganizationMemberCount: 2,
			pendingUnexpiredInvitationCount: 3
		});

		await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				planPolicy
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'admin@example.com'
			}
		);

		expect(port.createdInvitations).toHaveLength(1);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({ action: 'member.invite_plan_limit_denied' })
		);
	});

	it('blocks the created invitation if a concurrent invite pushes usage over the member cap', async () => {
		const ctx = createTestContext({ auth: { userId: 'actor-1', orgId: 'org-1', role: 'admin' } });
		const port = createOrganizationSettingsMemberManagementPort();
		const basePlanPolicy = createPlanPolicyPort({
			plan: 'free',
			memberLimit: 2,
			activeOrganizationMemberCount: 1,
			pendingUnexpiredInvitationCount: 0
		});
		const planPolicy = {
			readEffectivePlanPolicy: basePlanPolicy.readEffectivePlanPolicy,
			readOrganizationPlanUsage: vi
				.fn<() => Promise<OrganizationPlanUsage>>()
				.mockResolvedValueOnce({
					organizationId: 'org-1',
					asOf: '2026-05-24T12:00:00.000Z',
					activePersonnelCount: 0,
					activeOrganizationMemberCount: 1,
					pendingUnexpiredInvitationCount: 0,
					monthlyExportCount: 0,
					sources: {
						activePersonnel: { table: 'personnel', included: [], excluded: [] },
						activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: [] },
						pendingUnexpiredInvitations: { table: 'organization_invitations', included: [], excluded: [] },
						monthlyExports: {
							table: 'data_exports',
							included: [],
							excluded: [],
							period: { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' }
						}
					}
				})
				.mockResolvedValueOnce({
					organizationId: 'org-1',
					asOf: '2026-05-24T12:00:01.000Z',
					activePersonnelCount: 0,
					activeOrganizationMemberCount: 1,
					pendingUnexpiredInvitationCount: 2,
					monthlyExportCount: 0,
					sources: {
						activePersonnel: { table: 'personnel', included: [], excluded: [] },
						activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: [] },
						pendingUnexpiredInvitations: { table: 'organization_invitations', included: [], excluded: [] },
						monthlyExports: {
							table: 'data_exports',
							included: [],
							excluded: [],
							period: { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' }
						}
					}
				})
		};

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					planPolicy
				},
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'admin@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message:
				'This organization exceeded its plan member limit of 2 seats while creating the invitation. Revoke a pending invitation or upgrade before inviting another member.'
		});

		expect(port.createdInvitations).toHaveLength(1);
		expect(port.blockedInvitations).toEqual([
			{
				organizationId: 'org-1',
				invitationId: 'invite-created',
				blockedBy: 'actor-1',
				reason: 'plan_member_limit_overcap'
			}
		]);
		expect(port.accessRequestBridges).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.invite_plan_limit_overcap',
				details: expect.objectContaining({
					commercialPlan: 'free',
					memberLimit: 2,
					activeOrganizationMemberCount: 1,
					pendingUnexpiredInvitationCount: 2,
					blocked: true
				})
			})
		);
	});

	it('uses the shared usage read model so closed invitation history does not block direct member invites', async () => {
		const ctx = createTestContext({ auth: { userId: 'actor-1', orgId: 'org-1', role: 'admin' } });
		const port = createOrganizationSettingsMemberManagementPort();
		ctx.rawStore.seed('organization_memberships', [
			{ id: 'member-1', organization_id: 'org-1', user_id: 'user-1', role: 'owner' }
		]);
		ctx.rawStore.seed('organization_invitations', [
			{ id: 'invite-revoked', organization_id: 'org-1', email: 'revoked@example.com', status: 'revoked' },
			{ id: 'invite-declined', organization_id: 'org-1', email: 'declined@example.com', status: 'declined' },
			{ id: 'invite-expired', organization_id: 'org-1', email: 'expired@example.com', status: 'expired' },
			{ id: 'invite-blocked', organization_id: 'org-1', email: 'blocked@example.com', status: 'blocked' },
			{ id: 'invite-accepted', organization_id: 'org-1', email: 'accepted@example.com', status: 'accepted' }
		]);
		const planPolicy = {
			readEffectivePlanPolicy: createPlanPolicyPort({
				plan: 'free',
				memberLimit: 2,
				activeOrganizationMemberCount: 0,
				pendingUnexpiredInvitationCount: 0
			}).readEffectivePlanPolicy,
			readOrganizationPlanUsage: vi.fn(() =>
				readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: new Date('2026-05-24T12:00:00Z') })
			)
		};

		await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				planPolicy
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'admin@example.com'
			}
		);

		expect(port.createdInvitations).toHaveLength(1);
		expect(planPolicy.readOrganizationPlanUsage).toHaveBeenCalled();
	});

	it('denies admin invitations in read-only mode with policy audit metadata', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			},
			readOnly: true
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: port
				},
				{
					email: 'new.user@example.com',
					membershipRole: 'admin',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});

		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.inviteMember',
					reasonCode: 'denied:read-only-overlay',
					blockingOverlay: 'read-only-mode'
				},
				severity: 'warning'
			}
		]);
	});

	it('denies high-access members who are not admin or owner before creating invitations', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.invitationLookups).toEqual([]);
		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.inviteMember',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('requires owner rights before creating admin invitations', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: port
				},
				{
					email: 'new.admin@example.com',
					membershipRole: 'admin',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.invitationLookups).toEqual([]);
		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateAdminAccess',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('requires owner rights before granting member-management authority through a member invitation', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: port
				},
				{
					email: 'new.manager@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ canManageMembers: true }),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.invitationLookups).toEqual([]);
		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateAdminAccess',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('requires recent assurance before creating high-privilege invitations', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			},
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				requiresStepUp: true,
				sessionAgeMs: 60 * 60 * 1000
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();
		const delivery = createInvitationDeliveryPort('sent');

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					email: 'new.admin@example.com',
					membershipRole: 'admin',
					actorEmail: 'owner@example.com',
					origin: 'https://trooptotask.test'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
		});

		expect(port.createdInvitations).toEqual([]);
		expect(delivery.deliveries).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.high_privilege_invite_authorization_denied',
				resourceType: 'organization',
				resourceId: 'new.admin@example.com',
				details: {
					email: 'new.admin@example.com',
					membershipRole: 'admin',
					memberPreset: 'editor',
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.inviteHighPrivilege',
						reason: 'denied.staleSession',
						requiresStepUp: true
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects invalid invitation emails before querying pending invites', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'not-an-email',
					membershipRole: 'member',
					memberAccess: memberAccess(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Please enter a valid email address'
		});

		expect(port.invitationLookups).toEqual([]);
	});

	it('preserves the duplicate pending invite failure for the normalized email address', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingInvitationId: 'invite-1' });

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'USER@EXAMPLE.COM ',
					membershipRole: 'member',
					memberAccess: memberAccess(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'An invitation for this email is already pending'
		});

		expect(port.invitationLookups).toEqual([{ orgId: 'test-org', email: 'user@example.com' }]);
		expect(port.createdInvitations).toEqual([]);
	});

	it('rejects member invitations without a submitted Member Preset before writing compatibility fields', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Member preset is required'
		});

		expect(port.createdInvitations).toEqual([]);
	});

	it('allows admins to create ordinary member invitations without member-management authority', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'admin-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{
				email: 'member@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'admin@example.com'
			}
		);

		expect(port.createdInvitations).toHaveLength(1);
		expect(port.createdInvitations[0]).toMatchObject({
			role: 'member',
			permissions: expect.objectContaining({
				canManageMembers: false
			}),
			memberPreset: 'viewer'
		});
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
	});

	it('creates the invitation with target member access, logs the audit event, and notifies admins', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'NEW.USER@EXAMPLE.COM',
				membershipRole: 'member',
				memberAccess: memberAccess({
					memberPreset: 'operator',
					capabilityOverrides: { calendar: 'configure' },
					scopeSet: { kind: 'groups', groupIds: ['11111111-1111-4111-8111-111111111111'] }
				}),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({
			inviteSuccess: true,
			inviteEmail: 'new.user@example.com',
			inviteMessage:
				'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
		});
		expect(port.createdInvitations).toEqual([
			{
				organizationId: 'org-1',
				email: 'new.user@example.com',
				invitedBy: 'actor-1',
				role: 'member',
				singleGroupCompatibilityId: '11111111-1111-4111-8111-111111111111',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: false,
					canViewTraining: true,
					canEditTraining: false,
					canViewCriticalTasks: true,
					canEditCriticalTasks: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewRatingScheme: true,
					canEditRatingScheme: false,
					canManageMembers: false
				},
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111']
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.invite',
				resourceType: 'organization',
				details: {
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberPreset: 'operator'
				}
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'actor-1',
				notification: {
					type: 'member_invited',
					title: 'Member Invited',
					message: '"actor@example.com" invited "new.user@example.com" to the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('creates a pending Access Request bridge for a non-user invitation without granting membership', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'NEW.USER@EXAMPLE.COM',
				membershipRole: 'member',
				memberAccess: memberAccess({
					memberPreset: 'operator',
					capabilityOverrides: { calendar: 'configure' },
					scopeSet: { kind: 'groups', groupIds: ['11111111-1111-4111-8111-111111111111'] }
				}),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.userAccountLookups).toEqual(['new.user@example.com']);
		expect(port.accessRequestBridges).toEqual([
			{
				organizationId: 'org-1',
				invitationId: 'invite-created',
				email: 'new.user@example.com',
				invitedBy: 'actor-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: false,
					canViewTraining: true,
					canEditTraining: false,
					canViewCriticalTasks: true,
					canEditCriticalTasks: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewRatingScheme: true,
					canEditRatingScheme: false,
					canManageMembers: false
				},
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111']
			}
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_access_request_created',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				accessRequestId: 'access-request-1'
			},
			severity: 'info'
		});
		expect(ctx.notificationPort.notifications).toHaveLength(1);
	});

	it('links an existing pending Access Request for a non-user duplicate request instead of creating another request', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'linked', accessRequestId: 'pending-request-1' }
		});

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'pending@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.accessRequestBridges).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_access_request_linked',
			resourceType: 'organization',
			details: {
				email: 'pending@example.com',
				invitationId: 'invite-created',
				accessRequestId: 'pending-request-1'
			},
			severity: 'info'
		});
	});

	it('records idempotent Access Request invitation links without treating them as duplicate invitation rows', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'already-linked', accessRequestId: 'pending-request-1' }
		});

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'pending@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.createdInvitations).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_access_request_already_linked',
			resourceType: 'organization',
			details: {
				email: 'pending@example.com',
				invitationId: 'invite-created',
				accessRequestId: 'pending-request-1'
			},
			severity: 'info'
		});
	});

	it('does not create or link an Access Request when the invite email already has a User Account', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: { id: 'existing-user-1', email: 'member@example.com' }
		});

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'member@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.userAccountLookups).toEqual(['member@example.com']);
		expect(port.accessRequestBridges).toEqual([]);
	});

	it('blocks the created invitation and fails when non-user Access Request linking fails', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'failed', message: 'access request store unavailable' }
		});

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Invitation could not be created because platform access setup could not be linked'
		});

		expect(port.createdInvitations).toHaveLength(1);
		expect(port.blockedInvitations).toEqual([
			{
				organizationId: 'test-org',
				invitationId: 'invite-created',
				blockedBy: 'test-user',
				reason: 'access request store unavailable'
			}
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_access_request_link_failed',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				reason: 'access request store unavailable',
				blocked: true
			},
			severity: 'warning'
		});
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('allows owners to create member-management invitations with an immutable access snapshot', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{
				email: 'manager@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({
					memberPreset: 'viewer',
					capabilityOverrides: { personnel: 'configure' },
					scopeSet: { kind: 'groups', groupIds: ['22222222-2222-4222-8222-222222222222'] },
					canManageMembers: true
				}),
				actorEmail: 'owner@example.com'
			}
		);

		expect(port.createdInvitations).toEqual([
			{
				organizationId: 'org-1',
				email: 'manager@example.com',
				invitedBy: 'owner-1',
				role: 'member',
				singleGroupCompatibilityId: '22222222-2222-4222-8222-222222222222',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: false,
					canViewPersonnel: true,
					canEditPersonnel: true,
					canViewTraining: true,
					canEditTraining: false,
					canViewCriticalTasks: true,
					canEditCriticalTasks: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewRatingScheme: true,
					canEditRatingScheme: false,
					canManageMembers: true
				},
				memberPreset: 'viewer',
				capabilityOverrides: { personnel: 'configure' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['22222222-2222-4222-8222-222222222222']
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.invite',
				resourceType: 'organization',
				details: {
					email: 'manager@example.com',
					membershipRole: 'member',
					memberPreset: 'viewer',
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.inviteHighPrivilege',
						reason: 'allowed.recentSession'
					})
				}
			}
		]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([
			{
				action: 'organization.member.inviteHighPrivilege',
				actorUserId: 'owner-1',
				target: { type: 'organization_invitation', id: 'manager@example.com' }
			}
		]);
	});

	it('queues invitation email delivery after creating the invitation without granting membership', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('sent');
		const rateLimiter = createInvitationRateLimiter({ limited: false, action: 'create' });

		const result = await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery,
				invitationRateLimiter: rateLimiter
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toMatchObject({
			inviteSuccess: true,
			inviteEmail: 'new.user@example.com',
			inviteMessage: 'Invitation created and email delivery was queued.'
		});
		expect(delivery.deliveries).toEqual([
			{
				organizationId: 'org-1',
				invitationId: 'invite-created',
				email: 'new.user@example.com',
				organizationName: 'Alpha Company',
				invitedByEmail: 'actor@example.com',
				origin: 'https://trooptotask.test',
				requiresAccountSetup: false
			}
		]);
		expect(rateLimiter.checks).toEqual([
			{
				action: 'create',
				actorUserId: 'actor-1',
				organizationId: 'org-1',
				recipientEmail: 'new.user@example.com',
				invitationId: undefined
			}
		]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.invite',
				details: expect.objectContaining({
					email: 'new.user@example.com',
					rateLimit: expect.objectContaining({ action: 'create' })
				})
			})
		);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_sent',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				outboxId: 'outbox-1',
				deliveryMode: 'initial',
				rateLimit: expect.objectContaining({ action: 'create' })
			},
			severity: 'info'
		});
	});

	it('rate-limits invitation creation before creating another invitation or sending email', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('sent');
		const rateLimiter = createInvitationRateLimiter({ limited: true, retryAfterMs: 120_000, action: 'create' });

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery,
					invitationRateLimiter: rateLimiter
				},
				{
					email: ' New.User@Example.Mil ',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'actor@example.com',
					origin: 'https://trooptotask.test'
				}
			)
		).rejects.toMatchObject({
			status: 429,
			message:
				'Too many organization invitation attempts. Please wait before inviting this recipient again. Try again in about 2 minutes.'
		});

		expect(rateLimiter.checks).toEqual([
			{
				action: 'create',
				actorUserId: 'actor-1',
				organizationId: 'org-1',
				recipientEmail: 'new.user@example.mil',
				invitationId: undefined
			}
		]);
		expect(port.createdInvitations).toEqual([]);
		expect(delivery.deliveries).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_rate_limited',
			resourceType: 'organization',
			details: expect.objectContaining({
				email: 'new.user@example.mil',
				rateLimit: expect.objectContaining({
					action: 'create',
					retryAfterMs: 120_000
				})
			}),
			severity: 'warning'
		});
	});

	it('passes account setup context to invitation email delivery for non-user invitees', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			orgName: 'Alpha Company'
		});
		const delivery = createInvitationDeliveryPort('sent');

		await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				email: 'new.user@example.com',
				requiresAccountSetup: true
			})
		]);
	});

	it('leaves the invitation intact and audit-visible when initial email delivery fails', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('failed');

		const result = await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toMatchObject({
			inviteSuccess: true,
			inviteMessage: 'Invitation created, but email delivery failed. You can resend it from Pending Invitations.'
		});
		expect(port.createdInvitations).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_delivery_failed',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				outboxId: 'outbox-1',
				deliveryMode: 'initial'
			},
			severity: 'warning'
		});
	});

	it('keeps a created invitation retryable when outbox persistence throws during initial delivery', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = {
			async sendInvitationEmail() {
				throw new Error('outbox unavailable');
			}
		};

		const result = await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toMatchObject({
			inviteSuccess: true,
			inviteMessage: 'Invitation created, but email delivery failed. You can resend it from Pending Invitations.'
		});
		expect(port.createdInvitations).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_delivery_failed',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				deliveryMode: 'initial',
				reason: 'outbox-write-failed'
			},
			severity: 'warning'
		});
		consoleErrorSpy.mockRestore();
	});

	it('resends a pending invitation without creating another pending invitation or changing the access snapshot', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('sent');
		const rateLimiter = createInvitationRateLimiter({ limited: false, action: 'resend' });

		const result = await resendOrganizationInvitation(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery,
				invitationRateLimiter: rateLimiter
			},
			{
				inviteId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toEqual({
			success: true,
			inviteSuccess: true,
			inviteDeliveryStatus: 'sent',
			inviteMessage: 'Invitation email resent.'
		});
		expect(port.createdInvitations).toEqual([]);
		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				invitationId: '11111111-1111-4111-8111-111111111111',
				email: 'invitee@example.com',
				organizationName: 'Alpha Company'
			})
		]);
		expect(rateLimiter.checks).toEqual([
			{
				action: 'resend',
				actorUserId: 'test-user',
				organizationId: 'test-org',
				recipientEmail: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111'
			}
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_resent',
			resourceType: 'organization',
			details: {
				email: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111',
				outboxId: 'outbox-1',
				deliveryMode: 'resend',
				rateLimit: expect.objectContaining({ action: 'resend' })
			},
			severity: 'info'
		});
	});

	it('rate-limits invitation resend before enqueueing another invitation email', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('sent');
		const rateLimiter = createInvitationRateLimiter({ limited: true, retryAfterMs: 90_000, action: 'resend' });

		await expect(
			resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery,
					invitationRateLimiter: rateLimiter
				},
				{
					inviteId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com',
					origin: 'https://trooptotask.test'
				}
			)
		).rejects.toMatchObject({
			status: 429,
			message:
				'Too many organization invitation resend attempts. Please wait before trying again. Try again in about 2 minutes.'
		});

		expect(rateLimiter.checks).toEqual([
			{
				action: 'resend',
				actorUserId: 'test-user',
				organizationId: 'test-org',
				recipientEmail: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111'
			}
		]);
		expect(port.createdInvitations).toEqual([]);
		expect(delivery.deliveries).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_resend_rate_limited',
			resourceType: 'organization',
			details: expect.objectContaining({
				email: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111',
				rateLimit: expect.objectContaining({
					action: 'resend',
					retryAfterMs: 90_000
				})
			}),
			severity: 'warning'
		});
	});

	it('returns not found when resending a missing or non-actionable pending invitation', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ pendingInvitationById: null });
		const delivery = createInvitationDeliveryPort('sent');

		await expect(
			resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery
				},
				{
					inviteId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com',
					origin: 'https://trooptotask.test'
				}
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'Pending invitation not found'
		});

		expect(port.pendingInvitationByIdLookups).toEqual([
			{ orgId: 'test-org', inviteId: '11111111-1111-4111-8111-111111111111' }
		]);
		expect(delivery.deliveries).toEqual([]);
	});

	it('returns a clear expired failure when resending a stale pending invitation', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ pendingInvitationByIdStatus: 'expired' });
		const delivery = createInvitationDeliveryPort('sent');

		await expect(
			resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery
				},
				{
					inviteId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com',
					origin: 'https://trooptotask.test'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has expired. Create a new invitation instead.'
		});

		expect(delivery.deliveries).toEqual([]);
	});

	it('distinguishes resend delivery failures in audit details', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });
		const delivery = createInvitationDeliveryPort('failed');

		const result = await resendOrganizationInvitation(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery
			},
			{
				inviteId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toEqual({
			success: true,
			inviteSuccess: true,
			inviteDeliveryStatus: 'failed',
			inviteMessage: 'Invitation email delivery failed. The pending invitation is still intact and can be resent.'
		});
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_resend_delivery_failed',
			resourceType: 'organization',
			details: {
				email: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111',
				outboxId: 'outbox-1',
				deliveryMode: 'resend'
			},
			severity: 'warning'
		});
	});

	it('does not claim resend delivery succeeded when the delivery port is not configured', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ orgName: 'Alpha Company' });

		const result = await resendOrganizationInvitation(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port
			},
			{
				inviteId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com',
				origin: 'https://trooptotask.test'
			}
		);

		expect(result).toEqual({
			success: true,
			inviteSuccess: true,
			inviteDeliveryStatus: 'not_configured',
			inviteMessage: 'Invitation email delivery is not configured.'
		});
	});
});

describe('revokeOrganizationInvitation', () => {
	it('revokes the invite through the settings boundary and records the audit event', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await revokeOrganizationInvitation(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{ inviteId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(result).toEqual({ success: true, inviteSuccess: true, inviteMessage: 'Invitation revoked.' });
		expect(port.revokedInvitations).toEqual([{ orgId: 'org-1', inviteId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.invite_revoked',
				resourceType: 'organization',
				details: { inviteId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: ctx.auth.userId,
				notification: {
					type: 'member_invite_revoked',
					title: 'Invitation Revoked',
					message: '"invitee@example.com" can no longer use the revoked organization invitation.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('fails when invitation revocation returns a provider error', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			revokeInvitationResult: { status: 'failed', email: null }
		});

		await expect(
			revokeOrganizationInvitation(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{ inviteId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to revoke invitation'
		});
	});

	it('surfaces expired invitations without revoking terminal history', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			revokeInvitationResult: { status: 'expired', email: 'invitee@example.com' }
		});

		await expect(
			revokeOrganizationInvitation(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{ inviteId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has expired'
		});
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'admins',
				orgId: ctx.auth.orgId,
				excludeUserId: ctx.auth.userId,
				notification: {
					type: 'member_invite_expired',
					title: 'Invitation Expired',
					message: '"invitee@example.com" can no longer use the expired organization invitation.',
					link: `/org/${ctx.auth.orgId}/settings`
				}
			}
		]);
	});

	it.each([
		['not_found', 404, 'Invitation not found'],
		['already_accepted', 400, 'Invitation has already been accepted'],
		['already_declined', 400, 'Invitation has already been declined']
	] as const)('maps %s revoke statuses to clear action failures', async (status, expectedStatus, message) => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			revokeInvitationResult: { status, email: 'invitee@example.com' }
		});

		await expect(
			revokeOrganizationInvitation(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{ inviteId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: expectedStatus,
			message
		});
	});

	it('keeps the revoke response when governor notification delivery fails after the transition committed', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const ctx = createTestContext();
		vi.spyOn(ctx.notifications, 'notifyAdmins').mockRejectedValue(new Error('notification unavailable'));
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await revokeOrganizationInvitation(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{ inviteId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(result).toEqual({ success: true, inviteSuccess: true, inviteMessage: 'Invitation revoked.' });
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'[org-settings-member-management]',
			expect.objectContaining({
				status: 'revoked-notification-failed',
				organizationId: ctx.auth.orgId,
				userId: ctx.auth.userId
			})
		);

		consoleErrorSpy.mockRestore();
	});
});

describe('removeOrganizationMember', () => {
	it('denies high-access members who are not admin or owner before removing memberships', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.membershipLookups).toEqual([]);
		expect(port.removedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.removeMember',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects removing the current actor from the organization', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'actor-1',
				role: 'member',
				email: 'actor@example.com'
			}
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'You cannot remove yourself from the organization'
		});

		expect(port.removedMemberships).toEqual([]);
	});

	it('requires recent assurance before removing high-privilege members', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			},
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				requiresStepUp: true
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'admin-1',
				role: 'admin',
				email: 'admin@example.com',
				canManageMembers: true
			}
		});

		await expect(
			removeOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'owner@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
		});

		expect(port.removedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.high_privilege_remove_authorization_denied',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					targetRole: 'admin',
					targetCanManageMembers: true,
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.removeHighPrivilege',
						reason: 'denied.staleSession',
						requiresStepUp: true
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('allows recent high-privilege member removal and audits the sensitive action', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'manager-1',
				role: 'member',
				email: 'manager@example.com',
				canManageMembers: true
			}
		});

		const result = await removeOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'owner@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.removedMemberships).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.removed',
			resourceType: 'organization',
			details: {
				membershipId: '11111111-1111-4111-8111-111111111111',
				sensitiveAction: expect.objectContaining({
					action: 'organization.member.removeHighPrivilege',
					reason: 'allowed.recentSession'
				})
			}
		});
	});

	it('removes the membership, audits it, and sends the existing notifications', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			},
			orgName: 'Alpha Company'
		});

		const result = await removeOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.removedMemberships).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.removed',
				resourceType: 'organization',
				details: { membershipId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_removed',
					title: 'Removed from Organization',
					message: 'You have been removed from "Alpha Company".'
				}
			},
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'actor-1',
				notification: {
					type: 'member_removed',
					title: 'Member Removed',
					message: '"actor@example.com" removed "member@example.com" from the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('preserves the current missing-membership success path without sending notifications', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await removeOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.removedMemberships).toEqual([
			{ orgId: 'test-org', membershipId: '11111111-1111-4111-8111-111111111111' }
		]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.removed',
				resourceType: 'organization',
				details: { membershipId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
	});

	it('fails when membership removal returns a provider error', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			removeMembershipError: 'Failed to remove member'
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to remove member'
		});
	});
});

describe('leaveOrganization', () => {
	it('lets a non-owner member remove their own membership and notifies admins', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'actor-1',
				role: 'member',
				email: 'actor@example.com'
			},
			orgName: 'Alpha Company'
		});

		const result = await leaveOrganization(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				confirmation: 'YES',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.removedMemberships).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.left',
				resourceType: 'organization',
				details: { membershipId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'actor-1',
				notification: {
					type: 'member_left',
					title: 'Member Left Organization',
					message: '"actor@example.com" left "Alpha Company".',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('requires typed confirmation before leaving an organization', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'actor-1',
				role: 'member',
				email: 'actor@example.com'
			}
		});

		await expect(
			leaveOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					confirmation: 'yes',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Type YES to confirm leaving the organization'
		});

		expect(port.membershipLookups).toEqual([]);
		expect(port.removedMemberships).toEqual([]);
	});

	it('blocks organization owners before removing their membership', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'owner-1',
				role: 'owner',
				email: 'owner@example.com'
			}
		});

		await expect(
			leaveOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					confirmation: 'YES',
					actorEmail: 'owner@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization owners must transfer ownership before leaving the organization'
		});

		expect(port.removedMemberships).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('rejects attempts to leave with another member membership id', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-2',
				role: 'member',
				email: 'member2@example.com'
			}
		});

		await expect(
			leaveOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					confirmation: 'YES',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'You can only leave organizations for your own account'
		});

		expect(port.removedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'identity.leaveOrganization',
					reasonCode: 'denied:not-resource-owner'
				},
				severity: 'warning'
			}
		]);
	});
});

describe('updateOrganizationMemberPermissions', () => {
	it('rejects member access updates without a submitted Member Preset before writing compatibility fields', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Member preset is required'
		});

		expect(port.updatedMemberships).toEqual([]);
	});

	it('denies admins before granting another member admin access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin',
				requireOwner: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateAdminAccess',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('denies high-access members who are not admin or owner before updating access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberAccess: memberAccess(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateMemberAccess',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('requires owner rights before granting member-management authority through a member update', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberAccess: memberAccess({ canManageMembers: true }),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateAdminAccess',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('blocks owner permission changes before auth escalation checks', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'owner-1',
				role: 'owner',
				email: 'owner@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Cannot modify owner permissions'
		});

		expect(requireOwner).not.toHaveBeenCalled();
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([]);
	});

	it('requires recent assurance before granting admin access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			},
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				requiresStepUp: true,
				sessionAgeMs: 60 * 60 * 1000
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					actorEmail: 'owner@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.high_privilege_update_authorization_denied',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					currentRole: 'member',
					targetRole: 'admin',
					currentCanManageMembers: null,
					targetCanManageMembers: true,
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.updateHighPrivilege',
						reason: 'denied.staleSession',
						requiresStepUp: true
					})
				},
				severity: 'warning'
			}
		]);
	});

	it('requires recent assurance before revoking admin access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			},
			sensitiveActionDecision: {
				allowed: false,
				reason: 'denied.staleSession',
				requiresStepUp: true
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'admin-1',
				role: 'admin',
				email: 'admin@example.com',
				canManageMembers: true
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'owner@example.com'
				}
			)
		).rejects.toMatchObject({ status: 403 });

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.high_privilege_update_authorization_denied',
				details: expect.objectContaining({
					currentRole: 'admin',
					targetRole: 'member',
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.updateHighPrivilege',
						reason: 'denied.staleSession'
					})
				})
			})
		);
	});

	it('requires recent assurance before granting member-management authority without changing role', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com',
				canManageMembers: false
			}
		});

		const result = await updateOrganizationMemberPermissions(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				membershipRole: 'member',
				memberAccess: memberAccess({ canManageMembers: true }),
				actorEmail: 'owner@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([
			{
				action: 'organization.member.updateHighPrivilege',
				actorUserId: 'owner-1',
				target: { type: 'organization_membership', id: '11111111-1111-4111-8111-111111111111' }
			}
		]);
		expect(port.updatedMemberships).toEqual([
			expect.objectContaining({
				role: 'member',
				permissions: expect.objectContaining({ canManageMembers: true })
			})
		]);
	});

	it('requires owner rights for admin changes, updates the membership, and sends the role-change notification', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: null
			},
			orgName: 'Alpha Company'
		});

		const result = await updateOrganizationMemberPermissions(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				membershipRole: 'admin',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(requireOwner).not.toHaveBeenCalled();
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'admin',
				singleGroupCompatibilityId: null,
				permissions: buildPermissions({ canManageMembers: true }),
				memberPreset: 'editor',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.permissions_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					memberPreset: 'editor',
					sensitiveAction: expect.objectContaining({
						action: 'organization.member.updateHighPrivilege',
						reason: 'allowed.recentSession'
					})
				},
				severity: 'warning'
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_role_changed',
					title: 'Role Updated',
					message: 'Your role in "Alpha Company" has been changed to admin.'
				}
			}
		]);
	});

	it('uses governance policy for non-admin updates and keeps the permission-change notification path', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: null
			},
			orgName: 'Alpha Company'
		});
		const result = await updateOrganizationMemberPermissions(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				membershipRole: 'member',
				memberAccess: memberAccess({
					capabilityOverrides: { personnel: 'view' }
				}),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(requireOwner).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
				singleGroupCompatibilityId: null,
				permissions: buildPermissions({ canEditPersonnel: false }),
				memberPreset: 'editor',
				capabilityOverrides: { personnel: 'view' },
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_permissions_changed',
					title: 'Permissions Updated',
					message: 'Your permissions in "Alpha Company" have been updated.'
				}
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.permissions_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberPreset: 'editor'
				},
				severity: 'warning'
			}
		]);
	});

	it('persists target member access presets with explicit lane overrides and multi-group scope', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		const result = await updateOrganizationMemberPermissions(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				membershipRole: 'member',
				memberAccess: memberAccess({
					memberPreset: 'operator',
					capabilityOverrides: {
						calendar: 'configure',
						ratingScheme: 'none'
					},
					scopeSet: {
						kind: 'groups',
						groupIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
					}
				}),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
				singleGroupCompatibilityId: '22222222-2222-4222-8222-222222222222',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: false,
					canViewTraining: true,
					canEditTraining: false,
					canViewCriticalTasks: true,
					canEditCriticalTasks: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewRatingScheme: false,
					canEditRatingScheme: false,
					canManageMembers: false
				},
				memberPreset: 'operator',
				capabilityOverrides: {
					calendar: 'configure',
					ratingScheme: 'none'
				},
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
			}
		]);
	});
});
