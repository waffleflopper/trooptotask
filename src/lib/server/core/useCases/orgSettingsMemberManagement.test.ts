import { createClient } from '@supabase/supabase-js';
import {
	createSupabaseOrganizationInvitationDeliveryPort,
	sendOrganizationInvitationEmail
} from '$lib/server/organizationInvitationDelivery';
import { createAccessRequestSetupDeliveryService } from '$lib/server/accessRequestSetupDelivery';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseSensitiveActionAuthorizer } from '$lib/server/sensitiveActionAuthorizer';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	accountSetupLinkFixture,
	createAccessRequestSetupDeliveryStore,
	AUTH_WORKFLOW_NOW,
	authEmailOutboxRecordFixture,
	createFakeOrganizationInvitationDeliveryPort as createInvitationDeliveryPort,
	createFakeOrganizationInvitationRateLimiter as createInvitationRateLimiter,
	memberAccessFixture as memberAccess
} from '$lib/test-support/authWorkflowFixtures';
import type { AccountSetupLinkRecord, CreateAccountSetupLinkResult } from '$lib/server/accountSetupLinks';
import type { SendAccountSetupOutboxDeliveryResult } from '$lib/server/authEmailOutbox';
import {
	inviteOrganizationMember as inviteOrganizationMemberUseCase,
	leaveOrganization,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberAccess,
	type OrganizationInvitationAccessRequestBridgeInput,
	type OrganizationInvitationCreateInput,
	type OrganizationMembershipUpdateInput,
	type OrganizationSettingsMemberManagementPort
} from './orgSettingsMemberManagement';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => false)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

beforeEach(() => {
	billingEnabledMock.mockReturnValue(false);
	vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
});

const INVITE_ORIGIN = 'https://trooptotask.test';

function createAccountSetupIssuancePorts(
	options: {
		createResult?: CreateAccountSetupLinkResult;
		createError?: unknown;
		revokedLinks?: AccountSetupLinkRecord[];
		deliveryStatus?: 'sent' | 'failed';
	} = {}
): {
	setupLinks: { createForAccessRequest(accessRequestId: string): Promise<CreateAccountSetupLinkResult> };
	setupDelivery: { send(input: SetupDeliveryInput): Promise<SendAccountSetupOutboxDeliveryResult> };
	setupLinkRequests: string[];
	setupDeliveries: SetupDeliveryInput[];
} {
	const setupLinkRequests: string[] = [];
	const setupDeliveries: SetupDeliveryInput[] = [];

	return {
		setupLinkRequests,
		setupDeliveries,
		setupLinks: {
			async createForAccessRequest(accessRequestId) {
				setupLinkRequests.push(accessRequestId);
				if (options.createError) throw options.createError;
				return (
					options.createResult ?? {
						status: 'created',
						accessRequestId,
						rawToken: 'raw-setup-token',
						setupPath: '/auth/setup-account?token=raw-setup-token',
						expiresAt: new Date('2026-06-05T12:00:00.000Z'),
						link: accountSetupLinkFixture({ accessRequestId }),
						revokedLinks: options.revokedLinks ?? []
					}
				);
			}
		},
		setupDelivery: {
			async send(input) {
				setupDeliveries.push(input);
				const outbox = authEmailOutboxRecordFixture({
					accessRequestId: input.accessRequestId,
					setupLinkId: input.setupLinkId,
					recipient: input.email,
					createdAt: new Date('2026-05-22T12:00:00.000Z')
				});
				return options.deliveryStatus === 'failed'
					? { status: 'failed', outbox, error: 'setup email provider unavailable' }
					: { status: 'sent', outbox: { ...outbox, status: 'sent' } };
			}
		}
	};
}

interface SetupDeliveryInput {
	accessRequestId: string;
	setupLinkId: string;
	email: string;
	setupUrl: string;
	expiresAt: Date;
}

function createOrganizationSettingsMemberManagementPort(
	options: {
		existingInvitationId?: string | null;
		createInvitationError?: string | null;
		existingUserAccount?: { id: string; email: string; emailConfirmed?: boolean } | null;
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
		async createOrLinkApprovedAccessRequestForInvitation(input) {
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

const inviteOrganizationMember = (
	ports: Omit<Parameters<typeof inviteOrganizationMemberUseCase>[0], 'setupLinks' | 'setupDelivery'> &
		Partial<Pick<Parameters<typeof inviteOrganizationMemberUseCase>[0], 'setupLinks' | 'setupDelivery'>>,
	input: Parameters<typeof inviteOrganizationMemberUseCase>[1]
) =>
	inviteOrganizationMemberUseCase(
		{
			...createAccountSetupIssuancePorts(),
			...ports
		},
		{ origin: INVITE_ORIGIN, ...input }
	);

describe('inviteOrganizationMember', () => {
	it('denies high-access members who are not admin or owner before creating invitations', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member'
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

	it('does not treat member invitation feature-lane fields as member-management authority', async () => {
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
					settings: port
				},
				{
					email: 'new.manager@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ canManageMembers: true }),
					actorEmail: 'actor@example.com'
				}
			)
		).resolves.toMatchObject({ inviteSuccess: true });

		expect(port.createdInvitations).toHaveLength(1);
		expect(port.createdInvitations[0]).toEqual({
			organizationId: 'org-1',
			email: 'new.manager@example.com',
			invitedBy: 'actor-1',
			role: 'member',
			memberPreset: 'editor',
			capabilityOverrides: {},
			accessScopeKind: 'organization',
			accessScopeGroupIds: []
		});
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ policyAction: 'organization.updateAdminAccess' })
			})
		);
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

	it('rejects member invitations without a submitted Member Preset before creating an invitation', async () => {
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

	it.each([false, true])('bridges new invitees with billing=%s', async (billingEnabled) => {
		billingEnabledMock.mockReturnValue(billingEnabled);
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'created', accessRequestId: 'access-request-1' },
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

		expect(port.accessRequestBridges).toEqual([
			expect.objectContaining({
				organizationId: 'test-org',
				invitationId: 'invite-created',
				email: 'new.user@example.com',
				invitedBy: 'test-user'
			})
		]);
		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				email: 'new.user@example.com',
				requiresAccountSetup: true
			})
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

	it('issues and delivers an Account Setup Link for the bridged Access Request with no platform-admin action', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'created', accessRequestId: 'access-request-1' }
		});
		const issuance = createAccountSetupIssuancePorts();
		const delivery = createInvitationDeliveryPort('sent');

		const result = await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery,
				...issuance
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result.inviteSuccess).toBe(true);
		expect(issuance.setupLinkRequests).toEqual(['access-request-1']);
		expect(issuance.setupDeliveries).toEqual([
			expect.objectContaining({
				accessRequestId: 'access-request-1',
				setupLinkId: 'setup-link-1',
				email: 'new.user@example.com',
				setupUrl: 'https://trooptotask.test/auth/setup-account?token=raw-setup-token'
			})
		]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'access_request.account_setup_link_sent',
				resourceType: 'access_request',
				resourceId: 'access-request-1',
				details: expect.objectContaining({
					email: 'new.user@example.com',
					invitationId: 'invite-created',
					setupLinkId: 'setup-link-1'
				}),
				severity: 'info'
			})
		);
		// The invitee gets two emails, and the invitation stands on its own.
		expect(delivery.deliveries).toHaveLength(1);
		expect(port.blockedInvitations).toEqual([]);
	});

	it('issues a fresh setup link on every invite and audits the link it replaces', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: null,
			accessRequestBridgeResult: { status: 'linked', accessRequestId: 'access-request-1' }
		});
		const issuance = createAccountSetupIssuancePorts({
			revokedLinks: [accountSetupLinkFixture({ id: 'setup-link-0', accessRequestId: 'access-request-1' })]
		});

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(issuance.setupLinkRequests).toEqual(['access-request-1']);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'account_setup.link_revoked',
				resourceType: 'account_setup_link',
				resourceId: 'setup-link-0',
				details: expect.objectContaining({
					accessRequestId: 'access-request-1',
					replacementSetupLinkId: 'setup-link-1',
					stateTransition: 'pending.replaced'
				})
			})
		);
	});

	it('keeps the invitation successful when setup link delivery fails', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts({ deliveryStatus: 'failed' });
		const delivery = createInvitationDeliveryPort('sent');

		const result = await inviteOrganizationMember(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings: port,
				invitationDelivery: delivery,
				...issuance
			},
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toMatchObject({
			inviteSuccess: true,
			inviteEmail: 'new.user@example.com',
			inviteMessage: 'Invitation created and email delivery was queued.'
		});
		expect(port.blockedInvitations).toEqual([]);
		expect(ctx.notificationPort.notifications).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'access_request.account_setup_link_delivery_failed',
				resourceId: 'access-request-1',
				severity: 'warning'
			})
		);
	});

	it('keeps the invitation successful when setup link delivery throws after the link exists', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts();
		issuance.setupDelivery.send = async () => {
			throw new Error('auth email outbox unavailable');
		};

		const result = await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		// A live 14-day link exists; destroying the invitation would destroy the recovery path.
		expect(result.inviteSuccess).toBe(true);
		expect(port.blockedInvitations).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'access_request.account_setup_link_delivery_failed',
				resourceId: 'access-request-1',
				details: expect.objectContaining({ error: 'auth email outbox unavailable' }),
				severity: 'warning'
			})
		);
	});

	it('keeps the invitation successful when a sibling writer already created the setup link', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts({ createResult: { status: 'concurrent-create' } });

		const result = await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result.inviteSuccess).toBe(true);
		expect(issuance.setupDeliveries).toEqual([]);
		expect(port.blockedInvitations).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_account_setup_link_not_created',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				accessRequestId: 'access-request-1',
				reason: 'concurrent-create'
			},
			severity: 'info'
		});
	});

	it('blocks the created invitation and fails when the setup link cannot be created', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts({ createResult: { status: 'access-request-not-approved' } });

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Invitation could not be created because the account setup link could not be issued'
		});

		expect(port.blockedInvitations).toEqual([
			{
				organizationId: 'test-org',
				invitationId: 'invite-created',
				blockedBy: 'test-user',
				reason: 'access-request-not-approved'
			}
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_account_setup_link_not_created',
			resourceType: 'organization',
			details: {
				email: 'new.user@example.com',
				invitationId: 'invite-created',
				accessRequestId: 'access-request-1',
				reason: 'access-request-not-approved',
				blocked: true
			},
			severity: 'warning'
		});
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('blocks the created invitation and fails when the setup link provider throws', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts({
			createError: new Error('setup link store unavailable')
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
				{
					email: 'new.user@example.com',
					membershipRole: 'member',
					memberAccess: memberAccess({ memberPreset: 'viewer' }),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({ status: 500 });

		expect(port.blockedInvitations).toHaveLength(1);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'member.invite_account_setup_link_not_created',
				details: expect.objectContaining({ reason: 'provider-error', blocked: true })
			})
		);
		consoleError.mockRestore();
	});

	it('does not issue a setup link when the invitee already has a User Account', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: { id: 'existing-user-1', email: 'member@example.com' }
		});
		const issuance = createAccountSetupIssuancePorts();

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'member@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(issuance.setupLinkRequests).toEqual([]);
		expect(issuance.setupDeliveries).toEqual([]);
	});

	it('issues the separate setup credential even when billing is enabled', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts();

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'new.user@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.accessRequestBridges).toHaveLength(1);
		expect(issuance.setupLinkRequests).toEqual(['access-request-1']);
		expect(issuance.setupDeliveries).toEqual([
			expect.objectContaining({
				email: 'new.user@example.com',
				setupUrl: 'https://trooptotask.test/auth/setup-account?token=raw-setup-token'
			})
		]);
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
					memberPreset: 'viewer'
				}
			}
		]);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
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

	it.each([false, true])(
		'resends legacy invitations to a working reviewed-access destination with billing=%s',
		async (billingEnabled) => {
			billingEnabledMock.mockReturnValue(billingEnabled);
			vi.stubEnv('RESEND_API_KEY', 'synthetic-capture-only');
			vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@example.test');
			const ctx = createTestContext();
			const port = createOrganizationSettingsMemberManagementPort({
				existingUserAccount: null,
				pendingInvitationRequiresAccountSetup: false,
				orgName: 'Alpha Company'
			});
			const messages: { text: string; html: string }[] = [];
			let outboxRow: Record<string, unknown> = {};
			// Fake only persistence/transport; exercise the actual delivery adapter and renderer.
			const client = createClient('http://127.0.0.1:9', 'synthetic-test-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (url, init) => {
						if (new URL(String(url)).pathname.endsWith('/organization_invitation_email_outbox')) {
							outboxRow = { ...JSON.parse(init!.body as string), id: 'outbox-1', last_error: null, sent_at: null };
						} else if (
							new URL(String(url)).pathname.endsWith('/rpc/mark_organization_invitation_email_outbox_delivery')
						) {
							outboxRow = { ...outboxRow, status: 'sent', attempt_count: 1, sent_at: AUTH_WORKFLOW_NOW.toISOString() };
						} else {
							throw new Error('Unexpected persistence request');
						}
						return Response.json(outboxRow);
					}
				}
			});
			const delivery = createSupabaseOrganizationInvitationDeliveryPort(client, {
				sendEmail: (input) =>
					sendOrganizationInvitationEmail(input, async (_url, init) => {
						messages.push(JSON.parse(init.body as string));
						return { ok: true, status: 202, text: async () => '' };
					})
			});
			const issuance = createAccountSetupIssuancePorts();
			const result = await resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: port,
					invitationDelivery: delivery,
					...issuance
				},
				{ inviteId: '11111111-1111-4111-8111-111111111111', actorEmail: 'actor@example.com', origin: INVITE_ORIGIN }
			);
			expect(result.inviteDeliveryStatus).toBe('sent');
			expect(outboxRow).toMatchObject({ recipient: 'invitee@example.com', status: 'sent' });
			const destination = new URL(messages[0].html.match(/href="([^"]+)"/)![1]);
			expect(destination.pathname).toBe('/auth/request-access');
			for (const body of [messages[0].text, messages[0].html]) {
				expect(body).toContain(destination.href);
				expect(body).toMatch(/request access/i);
				expect(body).toMatch(/approv/i);
				expect(body).not.toMatch(/a separate email carries your account setup link/i);
			}
			expect(issuance.setupLinkRequests).toEqual([]);
			expect(issuance.setupDeliveries).toEqual([]);
			const requestStore = createAccessRequestSetupDeliveryStore();
			const sendSetupEmail = vi.fn();
			const service = createAccessRequestSetupDeliveryService(requestStore, sendSetupEmail, {
				now: () => AUTH_WORKFLOW_NOW
			});
			expect(
				await service.submitAccessRequest({
					email: 'invitee@example.com',
					firstName: 'Synthetic',
					lastName: 'Invitee',
					reason: null,
					heardAbout: 'search_engine',
					heardAboutDetails: null,
					origin: destination.origin
				})
			).toEqual({ status: 'pending-created' });
			expect(requestStore.insertedRequests).toEqual([expect.objectContaining({ email: 'invitee@example.com' })]);
			expect(requestStore.setupLinks).toEqual([]);
			expect(sendSetupEmail).not.toHaveBeenCalled();
		}
	);

	it('routes unlinked unconfirmed accounts to Request Access on resend', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: { id: 'existing-user-1', email: 'invitee@example.com', emailConfirmed: false },
			pendingInvitationRequiresAccountSetup: false,
			orgName: 'Alpha Company'
		});
		const delivery = createInvitationDeliveryPort('sent');

		await resendOrganizationInvitation(
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

		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				invitationId: '11111111-1111-4111-8111-111111111111',
				email: 'invitee@example.com',
				requiresAccountSetup: false,
				requiresAccessRequest: true
			})
		]);
	});

	it('keeps linked reviewed-access invitation resends on reviewed setup until setup completes', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: { id: 'existing-user-1', email: 'invitee@example.com' },
			pendingInvitationRequiresAccountSetup: true,
			orgName: 'Alpha Company'
		});
		const delivery = createInvitationDeliveryPort('sent');

		await resendOrganizationInvitation(
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

		expect(port.userAccountLookups).toContain('invitee@example.com');
		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				invitationId: '11111111-1111-4111-8111-111111111111',
				email: 'invitee@example.com',
				requiresAccountSetup: true
			})
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_resent',
			resourceType: 'organization',
			details: {
				email: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111',
				outboxId: 'outbox-1',
				deliveryMode: 'resend'
			},
			severity: 'info'
		});
	});

	it('resends linked reviewed-access invitations to sign-in once setup has completed', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			existingUserAccount: { id: 'existing-user-1', email: 'invitee@example.com' },
			pendingInvitationRequiresAccountSetup: false,
			orgName: 'Alpha Company'
		});
		const delivery = createInvitationDeliveryPort('sent');

		await resendOrganizationInvitation(
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

		expect(port.userAccountLookups).toContain('invitee@example.com');
		expect(delivery.deliveries).toEqual([
			expect.objectContaining({
				invitationId: '11111111-1111-4111-8111-111111111111',
				email: 'invitee@example.com',
				requiresAccountSetup: false
			})
		]);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'member.invite_email_resent',
			resourceType: 'organization',
			details: {
				email: 'invitee@example.com',
				invitationId: '11111111-1111-4111-8111-111111111111',
				outboxId: 'outbox-1',
				deliveryMode: 'resend'
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

	it('leaves the Access Request and its setup link intact so revoke-then-re-invite works', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const port = createOrganizationSettingsMemberManagementPort({ existingUserAccount: null });
		const issuance = createAccountSetupIssuancePorts();

		await revokeOrganizationInvitation(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{ inviteId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(port.accessRequestBridges).toEqual([]);
		expect(issuance.setupLinkRequests).toEqual([]);

		await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port, ...issuance },
			{
				email: 'invitee@example.com',
				membershipRole: 'member',
				memberAccess: memberAccess({ memberPreset: 'viewer' }),
				actorEmail: 'actor@example.com'
			}
		);

		expect(port.accessRequestBridges).toHaveLength(1);
		expect(issuance.setupLinkRequests).toEqual(['access-request-1']);
		expect(port.blockedInvitations).toEqual([]);
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
				role: 'member'
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

	it('preserves high-privilege membership until suspension is verifiably clear on retry', async () => {
		const ctx = createTestContext({ auth: { userId: 'owner-1', orgId: 'org-1', role: 'owner' } });
		const settings = createOrganizationSettingsMemberManagementPort({
			membership: { userId: 'admin-1', role: 'admin', email: 'admin@example.com', canManageMembers: true }
		});
		const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
		const ports = {
			auth: ctx.auth,
			audit: ctx.audit,
			notifications: ctx.notifications,
			settings,
			sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
				authenticatedUserId: 'owner-1',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: {
									currentLevel: 'aal1',
									nextLevel: 'aal1',
									currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
								},
								error: null
							})
						}
					},
					rpc
				} as never,
				session: {
					access_token: 'verified-request-token',
					expires_at: 1779454800,
					user: { id: 'owner-1', last_sign_in_at: '2026-05-22T11:59:00Z' }
				} as never,
				now: () => new Date('2026-05-22T12:00:00Z')
			})
		};
		const execute = () =>
			removeOrganizationMember(ports, {
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'owner@example.com'
			});
		await expect(execute()).rejects.toMatchObject({
			status: 403,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false,
			stepUpPath: null
		});
		expect(settings.removedMemberships).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'member.high_privilege_remove_authorization_denied' })
		);

		rpc.mockResolvedValue({ data: false, error: null });
		await expect(execute()).resolves.toEqual({ success: true });
		expect(settings.removedMemberships).toEqual([
			{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }
		]);
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

describe('updateOrganizationMemberAccess', () => {
	it('rejects member access updates without a submitted Member Preset before updating access', async () => {
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
			updateOrganizationMemberAccess(
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
			updateOrganizationMemberAccess(
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
				role: 'member'
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
			updateOrganizationMemberAccess(
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

	it('does not treat feature-lane member access fields as member-management authority', async () => {
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
			updateOrganizationMemberAccess(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberAccess: memberAccess({ canManageMembers: true }),
					actorEmail: 'actor@example.com'
				}
			)
		).resolves.toEqual({ accessSuccess: true });

		expect(port.updatedMemberships).toEqual([
			expect.objectContaining({
				role: 'member',
				memberPreset: 'editor'
			})
		]);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ policyAction: 'organization.updateAdminAccess' })
			})
		);
	});

	it('blocks owner access changes before auth escalation checks', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'owner-1',
				role: 'owner',
				email: 'owner@example.com'
			}
		});

		await expect(
			updateOrganizationMemberAccess(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Cannot modify owner access'
		});

		expect(port.updatedMemberships).toEqual([]);
	});

	it('returns not found before updating access for stale memberships', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'owner-1',
				orgId: 'org-1',
				role: 'owner'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({ membership: null });

		await expect(
			updateOrganizationMemberAccess(
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
					memberAccess: memberAccess(),
					actorEmail: 'owner@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'Membership not found'
		});

		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
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
			updateOrganizationMemberAccess(
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
			updateOrganizationMemberAccess(
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

	it('does not require step-up when member feature-lane fields include legacy member-management intent', async () => {
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

		const result = await updateOrganizationMemberAccess(
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

		expect(result).toEqual({ accessSuccess: true });
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
		expect(port.updatedMemberships).toEqual([
			expect.objectContaining({
				role: 'member'
			})
		]);
	});

	it('requires owner rights for admin changes, updates the membership, and sends the role-change notification', async () => {
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
				email: null
			},
			orgName: 'Alpha Company'
		});

		const result = await updateOrganizationMemberAccess(
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

		expect(result).toEqual({ accessSuccess: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'admin',
				memberPreset: 'editor',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.access_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'admin',
					memberPreset: 'editor',
					capabilityOverrides: {},
					accessScopeKind: 'organization',
					accessScopeGroupIds: [],
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

	it('uses governance policy for non-admin updates and keeps the member-access notification path', async () => {
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
				email: null
			},
			orgName: 'Alpha Company'
		});
		const result = await updateOrganizationMemberAccess(
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

		expect(result).toEqual({ accessSuccess: true });
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
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
					type: 'member_access_changed',
					title: 'Access Updated',
					message: 'Your access in "Alpha Company" has been updated.'
				}
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.access_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberPreset: 'editor',
					capabilityOverrides: { personnel: 'view' },
					accessScopeKind: 'organization',
					accessScopeGroupIds: []
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

		const result = await updateOrganizationMemberAccess(
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

		expect(result).toEqual({ accessSuccess: true });
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
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

describe('invitation credential and governance boundaries', () => {
	it.each(['sent', 'failed'] as const)(
		'resend with %s delivery never issues setup credentials or changes the invitation grant',
		async (deliveryStatus) => {
			const ctx = createTestContext();
			const settings = createOrganizationSettingsMemberManagementPort({
				existingUserAccount: null,
				pendingInvitationRequiresAccountSetup: true
			});
			const issuance = createAccountSetupIssuancePorts();
			const delivery = createInvitationDeliveryPort(deliveryStatus);
			const ports = {
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings,
				...issuance,
				invitationDelivery: delivery
			};
			expect(
				await resendOrganizationInvitation(ports, {
					inviteId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'owner@example.com',
					origin: INVITE_ORIGIN
				})
			).toMatchObject({ inviteSuccess: true, inviteDeliveryStatus: deliveryStatus });
			expect(issuance.setupLinkRequests).toEqual([]);
			expect(issuance.setupDeliveries).toEqual([]);
			expect(settings.accessRequestBridges).toEqual([]);
			expect(settings.createdInvitations).toEqual([]);
			expect(settings.updatedMemberships).toEqual([]);
			expect(delivery.deliveries).toEqual([expect.objectContaining({ requiresAccountSetup: true })]);
		}
	);

	it.each(['resend', 'revoke'] as const)(
		'denies ordinary members attempting to %s invitations before lookup or delivery',
		async (action) => {
			const ctx = createTestContext({ auth: { userId: 'member', orgId: 'org-a', role: 'member' } });
			const settings = createOrganizationSettingsMemberManagementPort();
			const delivery = createInvitationDeliveryPort('sent');
			const ports = {
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				settings,
				invitationDelivery: delivery
			};
			await expect(
				(action === 'resend' ? resendOrganizationInvitation : revokeOrganizationInvitation)(ports, {
					inviteId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'member@example.com',
					origin: INVITE_ORIGIN
				})
			).rejects.toMatchObject({ status: 403 });
			expect(settings.pendingInvitationByIdLookups).toEqual([]);
			expect(settings.revokedInvitations).toEqual([]);
			expect(delivery.deliveries).toEqual([]);
		}
	);
});
