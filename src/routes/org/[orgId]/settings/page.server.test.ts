import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspace.server';

const {
	buildLayoutContextMock,
	buildRouteContextMock,
	clearOrganizationUrlSlugMock,
	createSupabaseDataStoreMock,
	createSupabaseOrgSettingsAdministrationPortMock,
	createSupabaseOrganizationInvitationDeliveryPortMock,
	createSupabaseOrganizationInvitationRateLimiterMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	deleteOrganizationUseCaseMock,
	fetchAuditLogPreviewMock,
	getAdminClientMock,
	inviteOrganizationMemberMock,
	loadWithContextMock,
	renameOrganizationMock,
	resendOrganizationInvitationMock,
	revokeOrganizationInvitationMock,
	removeOrganizationMemberMock,
	transferOrganizationOwnershipMock,
	updateOrganizationMemberPermissionsMock,
	updateOrganizationUrlSlugMock
} = vi.hoisted(() => ({
	buildLayoutContextMock: vi.fn(),
	buildRouteContextMock: vi.fn(),
	clearOrganizationUrlSlugMock: vi.fn(),
	createSupabaseDataStoreMock: vi.fn(),
	createSupabaseOrgSettingsAdministrationPortMock: vi.fn(),
	createSupabaseOrganizationInvitationDeliveryPortMock: vi.fn(),
	createSupabaseOrganizationInvitationRateLimiterMock: vi.fn(),
	createSupabaseOrgSettingsMemberManagementPortMock: vi.fn(),
	deleteOrganizationUseCaseMock: vi.fn(),
	fetchAuditLogPreviewMock: vi.fn(),
	getAdminClientMock: vi.fn(),
	inviteOrganizationMemberMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	renameOrganizationMock: vi.fn(),
	resendOrganizationInvitationMock: vi.fn(),
	revokeOrganizationInvitationMock: vi.fn(),
	removeOrganizationMemberMock: vi.fn(),
	transferOrganizationOwnershipMock: vi.fn(),
	updateOrganizationMemberPermissionsMock: vi.fn(),
	updateOrganizationUrlSlugMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildLayoutContext: buildLayoutContextMock,
		buildRouteContext: buildRouteContextMock,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/adapters/supabaseDataStore', () => ({
	createSupabaseDataStore: createSupabaseDataStoreMock
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

vi.mock('$lib/server/core/useCases/auditLogQuery', () => ({
	fetchAuditLogPreview: fetchAuditLogPreviewMock
}));

vi.mock('$lib/server/adapters/supabaseOrgSettingsMemberManagement', () => ({
	createSupabaseOrgSettingsMemberManagementPort: createSupabaseOrgSettingsMemberManagementPortMock
}));

vi.mock('$lib/server/adapters/supabaseOrgSettingsAdministration', () => ({
	createSupabaseOrgSettingsAdministrationPort: createSupabaseOrgSettingsAdministrationPortMock
}));

vi.mock('$lib/server/organizationInvitationDelivery', () => ({
	createSupabaseOrganizationInvitationDeliveryPort: createSupabaseOrganizationInvitationDeliveryPortMock
}));

vi.mock('$lib/server/organizationInvitationRateLimit', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/organizationInvitationRateLimit')>(
		'$lib/server/organizationInvitationRateLimit'
	);

	return {
		...actual,
		createSupabaseOrganizationInvitationRateLimiter: createSupabaseOrganizationInvitationRateLimiterMock
	};
});

vi.mock('$lib/server/core/useCases/orgSettingsMemberManagement', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgSettingsMemberManagement')>(
		'$lib/server/core/useCases/orgSettingsMemberManagement'
	);

	return {
		...actual,
		inviteOrganizationMember: inviteOrganizationMemberMock,
		resendOrganizationInvitation: resendOrganizationInvitationMock,
		revokeOrganizationInvitation: revokeOrganizationInvitationMock,
		removeOrganizationMember: removeOrganizationMemberMock,
		updateOrganizationMemberPermissions: updateOrganizationMemberPermissionsMock
	};
});

vi.mock('$lib/server/core/useCases/orgSettingsAdministration', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgSettingsAdministration')>(
		'$lib/server/core/useCases/orgSettingsAdministration'
	);

	return {
		...actual,
		clearOrganizationUrlSlug: clearOrganizationUrlSlugMock,
		renameOrganization: renameOrganizationMock,
		transferOrganizationOwnership: transferOrganizationOwnershipMock,
		updateOrganizationUrlSlug: updateOrganizationUrlSlugMock,
		deleteOrganization: deleteOrganizationUseCaseMock
	};
});

import { actions, load as loadSettingsIndexPage, loadSettingsWorkspacePage as load } from './+page.server';
import { actions as generalActions, load as loadGeneralPage } from './general/+page.server';
import { actions as memberActions, load as loadMembersPage } from './members/+page.server';
import { buildMembersSettingsData } from './members/membersSettings.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

describe('org settings page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutContextMock.mockResolvedValue({
			auth: { orgId: 'org-1' }
		});
		buildRouteContextMock.mockResolvedValue({
			auth: { kind: 'auth', orgId: 'org-1' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' },
			rawStore: { kind: 'raw-store' },
			sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
		});
		getAdminClientMock.mockReturnValue({ kind: 'admin-client' });
		createSupabaseDataStoreMock.mockReturnValue({ kind: 'admin-store' });
		fetchAuditLogPreviewMock.mockResolvedValue({
			logs: [{ id: 'audit-1', action: 'organization.rename', createdAt: '2026-04-26T12:00:00Z' }],
			totalCount: 1,
			last30DaysCount: 1,
			page: 1,
			limit: 9,
			actionFilter: '',
			availableActions: []
		});
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'owner' },
				audit: { log: vi.fn() },
				store: {
					findMany: vi.fn(async (table: string) => {
						if (table === 'organization_memberships') {
							return [
								{
									id: 'membership-1',
									user_id: 'user-1',
									email: 'owner@example.com',
									role: 'owner',
									created_at: '2026-04-26T12:00:00Z',
									member_preset: 'editor',
									capability_overrides: {},
									access_scope_kind: 'organization',
									access_scope_group_ids: []
								},
								{
									id: 'membership-2',
									user_id: 'user-2',
									email: 'member@example.com',
									role: 'member',
									created_at: '2026-04-26T12:00:00Z',
									member_preset: 'editor',
									capability_overrides: {},
									access_scope_kind: 'organization',
									access_scope_group_ids: []
								}
							];
						}
						if (table === 'organization_invitations') {
							return [
								{
									id: 'invite-1',
									email: 'new@example.com',
									status: 'pending',
									created_at: '2026-04-26T12:00:00Z',
									expires_at: '2026-06-26T12:00:00Z',
									role: 'member',
									member_preset: 'viewer',
									capability_overrides: {},
									access_scope_kind: 'organization',
									access_scope_group_ids: []
								},
								{
									id: 'invite-2',
									email: 'other@example.com',
									status: 'pending',
									created_at: '2026-04-27T12:00:00Z',
									expires_at: '2026-06-27T12:00:00Z',
									role: 'member',
									member_preset: 'operator',
									capability_overrides: {},
									access_scope_kind: 'groups',
									access_scope_group_ids: ['group-1']
								}
							];
						}
						if (table === 'groups') return [{ id: 'group-1', name: 'HQ', organization_id: 'org-1' }];
						if (table === 'personnel') {
							return [
								{
									id: 'person-1',
									organization_id: 'org-1',
									first_name: 'Avery',
									last_name: 'Jones',
									rank: 'SGT',
									mos: '11B',
									group_id: 'group-1',
									group_name: 'HQ',
									archived_at: '2026-04-01T12:00:00Z'
								}
							];
						}
						if (table === 'deletion_requests') {
							return [
								{ id: 'request-1', status: 'approved', created_at: '2026-04-30T12:00:00Z' },
								{ id: 'request-2', status: 'pending', created_at: '2026-05-01T12:00:00Z' }
							];
						}
						return [];
					})
				},
				rawStore: {
					findOne: vi.fn(async (table: string) => {
						if (table === 'organization_billing_snapshots') return null;
						if (table === 'organizations') {
							return {
								id: 'org-1',
								tier: 'unit',
								stripe_customer_id: null,
								stripe_subscription_id: null,
								subscription_status: null,
								current_period_end: null,
								gift_tier: null,
								gift_expires_at: null,
								archive_retention_months: 42,
								loss_warning_window_days: 150,
								critical_tasks_default_expiration_months: 18,
								critical_tasks_expiring_soon_warning_days: 45
							};
						}
						return null;
					}),
					findMany: vi.fn(async () => [])
				}
			})
		);
		createSupabaseOrgSettingsAdministrationPortMock.mockReturnValue({ kind: 'admin-port' });
		createSupabaseOrgSettingsMemberManagementPortMock.mockReturnValue({ kind: 'settings-port' });
		createSupabaseOrganizationInvitationDeliveryPortMock.mockReturnValue({ kind: 'invitation-delivery-port' });
		createSupabaseOrganizationInvitationRateLimiterMock.mockReturnValue({ kind: 'invitation-rate-limiter' });
		clearOrganizationUrlSlugMock.mockResolvedValue({ slugSuccess: true, orgUrlSlug: null });
		deleteOrganizationUseCaseMock.mockResolvedValue({ success: true });
		inviteOrganizationMemberMock.mockResolvedValue({ inviteSuccess: true });
		resendOrganizationInvitationMock.mockResolvedValue({
			success: true,
			inviteSuccess: true,
			inviteMessage: 'Invitation email resent.'
		});
		revokeOrganizationInvitationMock.mockResolvedValue({
			success: true,
			inviteSuccess: true,
			inviteMessage: 'Invitation revoked.'
		});
		removeOrganizationMemberMock.mockResolvedValue({ success: true });
		renameOrganizationMock.mockResolvedValue({ nameSuccess: true });
		transferOrganizationOwnershipMock.mockResolvedValue({ transferSuccess: true });
		updateOrganizationMemberPermissionsMock.mockResolvedValue({ permissionSuccess: true });
		updateOrganizationUrlSlugMock.mockResolvedValue({ slugSuccess: true, orgUrlSlug: '1-11-bde' });
	});

	it('redirects the settings index route to General settings', async () => {
		await expect(
			loadSettingsIndexPage({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {},
				parent: async () => ({
					orgId: 'org-1',
					orgUrlSegment: '1-11-bde'
				})
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/org/1-11-bde/settings/general' });
	});

	it('loads explicit General settings data without workspace section rows', async () => {
		const result = await loadGeneralPage({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: '1-11-bde',
				orgName: 'Test Org',
				allOrgs: [],
				isAdmin: true,
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: true }
			})
		} as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			planUsageSummary: expect.any(Object),
			generalSettings: {
				currentMember: { role: 'owner', canManageMembers: true },
				sections: {
					organization: {
						id: 'org-1',
						name: 'Test Org',
						urlSlug: '1-11-bde',
						canUpdateProfile: true,
						canUpdateUrlSlug: true
					}
				}
			}
		});
		expect('workspace' in (result as Record<string, unknown>)).toBe(false);
	});

	it('loads explicit Members settings data without the full settings workspace', async () => {
		const result = await loadMembersPage({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: '1-11-bde',
				orgName: 'Test Org',
				allOrgs: [],
				isAdmin: true,
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: true },
				session: { user: { email: 'owner@example.com' } }
			})
		} as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: '1-11-bde',
			membersSettings: {
				currentMember: { role: 'owner', canManageMembers: true },
				sections: {
					members: {
						rows: [{ email: 'owner@example.com' }, { email: 'member@example.com' }],
						invitations: [expect.objectContaining({ id: 'invite-1' }), expect.objectContaining({ id: 'invite-2' })],
						groups: [{ id: 'group-1', name: 'HQ' }],
						pendingApprovalSummary: {
							count: 1,
							oldestCreatedAt: '2026-05-01T12:00:00Z'
						}
					}
				}
			}
		});
		const resultRecord = result as Record<string, { sections: Record<string, unknown> }>;
		expect('workspace' in resultRecord).toBe(false);
		expect('policies' in resultRecord.membersSettings.sections).toBe(false);
		expect('archivedPersonnel' in resultRecord.membersSettings.sections).toBe(false);
		expect('dataExport' in resultRecord.membersSettings.sections).toBe(false);
		expect('dangerZone' in resultRecord.membersSettings.sections).toBe(false);
		expect(fetchAuditLogPreviewMock).not.toHaveBeenCalled();
	});

	it('shapes Members invitations with expiry and delivery status semantics', () => {
		const result = buildMembersSettingsData({
			currentMemberRole: 'owner',
			isAdmin: true,
			members: [
				{
					id: 'membership-1',
					organization_id: 'org-1',
					user_id: 'user-1',
					email: 'owner@example.com',
					role: 'owner',
					created_at: '2026-04-26T12:00:00Z',
					member_preset: 'editor',
					capability_overrides: {},
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			invitations: [
				{
					id: 'invite-pending',
					email: 'pending@example.com',
					role: 'member',
					status: 'pending',
					created_at: '2026-04-26T12:00:00Z',
					expires_at: '2999-06-26T12:00:00Z',
					member_preset: 'viewer',
					capability_overrides: {},
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-expired',
					email: 'expired@example.com',
					role: 'member',
					status: 'pending',
					created_at: '2026-04-20T12:00:00Z',
					expires_at: '2000-06-26T12:00:00Z',
					member_preset: 'operator',
					capability_overrides: {},
					access_scope_kind: 'groups',
					access_scope_group_ids: ['group-1']
				}
			],
			invitationDeliveries: [
				{
					id: 'delivery-1',
					invitation_id: 'invite-pending',
					status: 'failed',
					attempt_count: 2,
					last_error: 'SMTP unavailable',
					updated_at: '2026-04-27T12:00:00Z',
					sent_at: null
				}
			],
			groups: [{ id: 'group-1', name: 'HQ', organization_id: 'org-1' }]
		});

		expect(result.sections.members.invitations).toEqual([
			expect.objectContaining({
				id: 'invite-pending',
				canResend: true,
				deliveryStatus: 'failed',
				deliveryStatusLabel: 'Email failed',
				deliveryAttemptCount: 2,
				deliveryLastError: 'SMTP unavailable'
			})
		]);
		expect(result.sections.members.invitationHistory).toEqual([
			expect.objectContaining({
				id: 'invite-expired',
				canResend: false,
				lifecycleStatus: 'expired',
				lifecycleAt: '2000-06-26T12:00:00Z',
				scopeDisplayLabel: 'HQ'
			})
		]);
	});

	it('loads a consolidated admin settings workspace payload', async () => {
		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: '1-11-bde',
				orgName: 'Test Org',
				userRole: 'admin',
				allOrgs: [],
				isAdmin: true,
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: true }
			})
		} as never);

		expect(loadWithContextMock).toHaveBeenCalledWith(
			{},
			{},
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
				policyResource: { kind: 'organization' }
			})
		);
		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: '1-11-bde',
			orgUrlSlug: '1-11-bde',
			orgName: 'Test Org',
			effectiveTier: {
				tier: 'unit',
				source: 'subscription',
				personnelCount: 4,
				personnelCap: 500,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			},
			planUsageSummary: {
				plan: expect.objectContaining({
					tier: 'unit'
				}),
				rows: expect.arrayContaining([
					expect.objectContaining({ dimension: 'active_personnel' }),
					expect.objectContaining({ dimension: 'active_organization_members' }),
					expect.objectContaining({ dimension: 'pending_invitations' }),
					expect.objectContaining({ dimension: 'monthly_exports' })
				])
			},
			workspace: {
				currentMember: {
					role: 'owner',
					isOwner: true,
					canManageMembers: true
				},
				sections: {
					organization: {
						id: 'org-1',
						name: 'Test Org',
						urlSlug: '1-11-bde',
						urlSegment: '1-11-bde',
						tier: {
							tier: 'unit',
							source: 'subscription',
							personnelCount: 4,
							personnelCap: 500,
							isReadOnly: false,
							giftExpiresAt: null,
							giftTier: null
						}
					},
					members: {
						rows: [
							{ email: 'owner@example.com' },
							expect.objectContaining({
								email: 'member@example.com',
								access: expect.objectContaining({
									memberPreset: 'editor',
									scopeSet: { kind: 'organization' }
								})
							})
						],
						invitations: [
							expect.objectContaining({
								id: 'invite-1',
								membershipRole: 'member',
								access: expect.objectContaining({
									memberPreset: 'viewer',
									scopeSet: { kind: 'organization' }
								})
							}),
							expect.objectContaining({ id: 'invite-2' })
						],
						groups: [{ id: 'group-1', name: 'HQ' }],
						pendingApprovalSummary: {
							count: 1,
							oldestCreatedAt: '2026-05-01T12:00:00Z'
						}
					},
					policies: {
						archiveRetention: { savedMonths: 42 },
						lossWarning: { savedDays: 150 },
						criticalTasks: {
							savedDefaultExpirationMonths: 18,
							savedExpiringSoonWarningDays: 45
						}
					},
					archivedPersonnel: {
						rows: [{ id: 'person-1', displayName: 'SGT Jones, Avery' }],
						retention: { months: 42, purgeSummary: '1 archived record' }
					},
					dataExport: {
						activity: {
							approvalRequests: [
								expect.objectContaining({ id: 'request-1', status: 'approved' }),
								expect.objectContaining({ id: 'request-2', status: 'pending' })
							],
							pendingApprovalsCount: 1,
							auditLog: {
								totalCount: 1,
								last30DaysCount: 1,
								availableActions: []
							}
						},
						exportInfo: {
							exportsUsed: 0,
							isLimited: false,
							limitReached: false
						}
					},
					dangerZone: {
						commands: {
							canDeleteOrganization: true
						}
					}
				}
			}
		});
		expect(fetchAuditLogPreviewMock).toHaveBeenCalledWith(expect.anything(), { kind: 'admin-store' }, { limit: 9 });
	});

	it('starts workspace source reads before audit preview resolves', async () => {
		let resolveAuditLog!: (value: Awaited<ReturnType<typeof fetchAuditLogPreviewMock>>) => void;
		const auditLogPromise = new Promise<Awaited<ReturnType<typeof fetchAuditLogPreviewMock>>>((resolve) => {
			resolveAuditLog = resolve;
		});
		const findMany = vi.fn(async (table: string) => {
			if (table === 'organization_memberships') return [];
			if (table === 'organization_invitations') return [];
			if (table === 'groups') return [];
			if (table === 'personnel') return [];
			if (table === 'deletion_requests') return [];
			return [];
		});

		fetchAuditLogPreviewMock.mockReturnValueOnce(auditLogPromise);
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'owner' },
				audit: { log: vi.fn() },
				store: { findMany },
				rawStore: {
					findOne: vi.fn(async (table: string) => {
						if (table === 'organization_billing_snapshots') return null;
						if (table === 'organizations') {
							return {
								id: 'org-1',
								tier: 'free',
								stripe_customer_id: null,
								stripe_subscription_id: null,
								subscription_status: null,
								current_period_end: null,
								gift_tier: null,
								gift_expires_at: null,
								archive_retention_months: 42,
								loss_warning_window_days: 150,
								critical_tasks_default_expiration_months: 18,
								critical_tasks_expiring_soon_warning_days: 45
							};
						}
						return null;
					}),
					findMany: vi.fn(async () => [])
				}
			})
		);

		const loadPromise = load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				orgName: 'Test Org',
				userRole: 'owner',
				allOrgs: [],
				isAdmin: true,
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: true }
			})
		} as never);

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(findMany).toHaveBeenCalledWith('organization_memberships', 'org-1', undefined, {
			select:
				'id, organization_id, user_id, email, role, created_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
		});
		expect(findMany).toHaveBeenCalledWith('organization_invitations', 'org-1', undefined, {
			select:
				'id, email, role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, expired_at, blocked_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids',
			orderBy: [{ column: 'created_at', ascending: false }]
		});

		resolveAuditLog({
			logs: [],
			totalCount: 7,
			last30DaysCount: 3,
			page: 1,
			limit: 9,
			actionFilter: '',
			availableActions: []
		});
		const result = await loadPromise;

		expect(result).toMatchObject({
			workspace: {
				sections: {
					dataExport: {
						activity: {
							auditLog: {
								totalCount: 7,
								last30DaysCount: 3
							}
						}
					}
				}
			}
		});
	});

	it('loads settings export info from plan policy and organization usage', async () => {
		const now = new Date().toISOString();
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'owner' },
				audit: { log: vi.fn() },
				store: {
					findMany: vi.fn(async () => [])
				},
				rawStore: {
					findOne: vi.fn(async (table: string) => {
						if (table === 'organization_billing_snapshots') return null;
						if (table === 'organizations') {
							return {
								id: 'org-1',
								tier: 'free',
								stripe_customer_id: null,
								stripe_subscription_id: null,
								subscription_status: null,
								current_period_end: null,
								gift_tier: null,
								gift_expires_at: null,
								archive_retention_months: 42,
								loss_warning_window_days: 150,
								critical_tasks_default_expiration_months: 18,
								critical_tasks_expiring_soon_warning_days: 45
							};
						}
						return null;
					}),
					findMany: vi.fn(async (table: string) => {
						if (table === 'data_exports') {
							return [
								{ id: 'export-1', org_id: 'org-1', created_at: now },
								{ id: 'export-2', org_id: 'org-1', created_at: now }
							];
						}
						return [];
					})
				}
			})
		);

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				orgName: 'Test Org',
				userRole: 'owner',
				allOrgs: [],
				isAdmin: true,
				effectiveTier: {
					tier: 'free',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 20,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: true }
			})
		} as never);

		const workspace = (result as Awaited<ReturnType<typeof load>> & { workspace: OrganizationSettingsWorkspace })
			.workspace;
		expect(workspace.sections.dataExport.exportInfo).toMatchObject({
			exportsUsed: 2,
			exportsLimit: 3,
			isLimited: true,
			limitReached: false
		});
	});

	it('denies governance workspace access through policy before loading settings data', async () => {
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) => {
			expect(config).toMatchObject({
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
				policyResource: { kind: 'organization' }
			});
			const error = new Error('This action requires an organization admin or owner role') as Error & {
				status?: number;
			};
			error.status = 403;
			throw error;
		});

		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {},
				parent: async () => ({
					orgId: 'org-1',
					orgUrlSegment: 'org-1',
					orgName: 'Test Org',
					userRole: 'member',
					allOrgs: [],
					isAdmin: false,
					effectiveTier: {
						tier: 'unit',
						source: 'subscription',
						personnelCount: 4,
						personnelCap: 500,
						isReadOnly: false,
						giftExpiresAt: null,
						giftTier: null
					},
					permissions: { canManageMembers: true }
				})
			} as never)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});
	});

	it('derives member-management hints from the authorized route context', async () => {
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'admin' },
				audit: { log: vi.fn() },
				store: {
					findMany: vi.fn(async (table: string) => {
						if (table === 'organization_memberships') return [];
						if (table === 'organization_invitations') return [];
						if (table === 'groups') return [];
						if (table === 'personnel') return [];
						if (table === 'deletion_requests') return [];
						return [];
					})
				},
				rawStore: {
					findOne: vi.fn(async (table: string) => {
						if (table === 'organization_billing_snapshots') return null;
						if (table === 'organizations') {
							return {
								id: 'org-1',
								tier: 'free',
								stripe_customer_id: null,
								stripe_subscription_id: null,
								subscription_status: null,
								current_period_end: null,
								gift_tier: null,
								gift_expires_at: null,
								archive_retention_months: 42,
								loss_warning_window_days: 150,
								critical_tasks_default_expiration_months: 18,
								critical_tasks_expiring_soon_warning_days: 45
							};
						}
						return null;
					}),
					findMany: vi.fn(async () => [])
				}
			})
		);

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				orgName: 'Test Org',
				userRole: 'member',
				allOrgs: [],
				isAdmin: false,
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				},
				permissions: { canManageMembers: false }
			})
		} as never);

		expect(result).toMatchObject({ workspace: { currentMember: { role: 'admin', canManageMembers: true } } });
		expect(
			(result as Awaited<ReturnType<typeof load>> & { workspace: { currentMember: object } }).workspace.currentMember
		).not.toMatchObject({ canManageMembers: false });
	});

	it('returns a name-specific success flag for organization rename', async () => {
		const result = await generalActions.updateName({
			request: new Request('http://localhost/org/org-1/settings?/updateName', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: 'Renamed Org' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({ nameSuccess: true });
		expect(renameOrganizationMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				administration: { kind: 'admin-port' }
			},
			{ name: 'Renamed Org' }
		);
	});

	it('redirects to the new organization URL slug after updating the slug', async () => {
		updateOrganizationUrlSlugMock.mockResolvedValueOnce({ slugSuccess: true, orgUrlSlug: 'new-bde' });

		await expect(
			generalActions.updateSlug({
				request: new Request('http://localhost/org/1-11-bde/settings?/updateSlug', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ urlSlug: 'new-bde' })
				}),
				locals: {
					user: { id: 'user-1', email: 'user@example.com' },
					supabase: {}
				},
				params: { orgId: '1-11-bde' },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/new-bde/settings/general'
		});

		expect(updateOrganizationUrlSlugMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				readOnlyGuard: undefined,
				administration: { kind: 'admin-port' }
			},
			{ urlSlug: 'new-bde' }
		);
	});

	it('redirects to the organization ID URL after clearing the slug', async () => {
		await expect(
			generalActions.clearSlug({
				request: new Request('http://localhost/org/1-11-bde/settings?/clearSlug', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams()
				}),
				locals: {
					user: { id: 'user-1', email: 'user@example.com' },
					supabase: {}
				},
				params: { orgId: '1-11-bde' },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/settings/general'
		});

		expect(clearOrganizationUrlSlugMock).toHaveBeenCalledWith({
			auth: { kind: 'auth', orgId: 'org-1' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' },
			readOnlyGuard: undefined,
			administration: { kind: 'admin-port' }
		});
	});

	it('delegates ownership transfer to the org administration use case', async () => {
		const result = await actions.transferOwnership({
			request: new Request('http://localhost/org/org-1/settings?/transferOwnership', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					confirmTransferEmail: 'new-owner@example.com'
				})
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({ transferSuccess: true });
		expect(transferOrganizationOwnershipMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				administration: { kind: 'admin-port' },
				sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
			},
			{
				newOwnerId: '11111111-1111-4111-8111-111111111111',
				confirmTransferEmail: 'new-owner@example.com'
			}
		);
		expect(createSupabaseOrgSettingsAdministrationPortMock).toHaveBeenCalledWith({
			user: { id: 'user-1', email: 'user@example.com' },
			supabase: {}
		});
	});

	it('maps ownership-transfer failures back into the transferError action payload', async () => {
		transferOrganizationOwnershipMock.mockRejectedValue(Object.assign(new Error('Invalid user ID'), { status: 400 }));

		const result = await actions.transferOwnership({
			request: new Request('http://localhost/org/org-1/settings?/transferOwnership', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ newOwnerId: 'bad-id' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { transferError: 'Invalid user ID' }
		});
	});

	it('preserves sensitive-action step-up details in ownership-transfer failures', async () => {
		transferOrganizationOwnershipMock.mockRejectedValue(
			Object.assign(new Error('Please confirm your identity before continuing.'), {
				status: 403,
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			})
		);

		const result = await actions.transferOwnership({
			request: new Request('http://localhost/org/org-1/settings?/transferOwnership', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					confirmTransferEmail: 'new-owner@example.com'
				})
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 403,
			data: {
				transferError: 'Please confirm your identity before continuing.',
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});
	});

	it('preserves sensitive-action step-up details in high-privilege invite failures', async () => {
		inviteOrganizationMemberMock.mockRejectedValue(
			Object.assign(new Error('Please sign in again before continuing.'), {
				status: 403,
				reason: 'denied.unauthenticated',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			})
		);

		const result = await memberActions.invite({
			request: new Request('http://localhost/org/org-1/settings?/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ email: 'admin@example.com', membershipRole: 'admin' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 403,
			data: {
				inviteError: 'Please sign in again before continuing.',
				reason: 'denied.unauthenticated',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			}
		});
	});

	it('redirects after the destructive org administration use case succeeds', async () => {
		await expect(
			actions.deleteOrganization({
				request: new Request('http://localhost/org/org-1/settings?/deleteOrganization', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ confirmName: '  Test Org  ' })
				}),
				locals: {
					user: { id: 'user-1', email: 'user@example.com' },
					supabase: {}
				},
				params: { orgId: 'org-1' },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?show=all'
		});

		expect(deleteOrganizationUseCaseMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				administration: { kind: 'admin-port' },
				sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
			},
			{ confirmName: '  Test Org  ' }
		);
	});

	it('maps destructive org-operation failures back into the deleteError action payload', async () => {
		deleteOrganizationUseCaseMock.mockRejectedValue(
			Object.assign(new Error('Organization name does not match'), { status: 400 })
		);

		const result = await actions.deleteOrganization({
			request: new Request('http://localhost/org/org-1/settings?/deleteOrganization', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ confirmName: 'Other Org' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { deleteError: 'Organization name does not match' }
		});
	});

	it('redirects unauthenticated users to login before invoking the invite flow', async () => {
		await expect(
			memberActions.invite({
				request: new Request('http://localhost/org/org-1/settings?/invite', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ email: 'user@example.com', memberPreset: 'viewer' })
				}),
				locals: {},
				params: { orgId: 'org-1' },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});

		expect(buildRouteContextMock).not.toHaveBeenCalled();
		expect(inviteOrganizationMemberMock).not.toHaveBeenCalled();
	});

	it('maps use-case invite failures back into the inviteError action payload', async () => {
		inviteOrganizationMemberMock.mockRejectedValue(
			Object.assign(new Error('Please enter a valid email address'), { status: 400 })
		);

		const result = await memberActions.invite({
			request: new Request('http://localhost/org/org-1/settings?/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ email: 'bad-email', memberPreset: 'viewer' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { inviteError: 'Please enter a valid email address' }
		});
		expect(createSupabaseOrgSettingsMemberManagementPortMock).toHaveBeenCalledWith({
			user: { id: 'user-1', email: 'user@example.com' },
			supabase: {}
		});
	});

	it('translates the target invite form into the use-case input shape', async () => {
		const result = await memberActions.invite({
			request: new Request('http://localhost/org/org-1/settings?/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					email: 'new.member@example.com',
					membershipRole: 'member',
					memberPreset: 'viewer',
					'capabilityOverride:calendar': 'operate',
					scopeSetKind: 'groups',
					scopeSetGroupIds: '11111111-1111-4111-8111-111111111111'
				})
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({ inviteSuccess: true });
		expect(inviteOrganizationMemberMock).toHaveBeenLastCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				store: { kind: 'raw-store' },
				readOnlyGuard: undefined,
				settings: { kind: 'settings-port' },
				invitationDelivery: { kind: 'invitation-delivery-port' },
				invitationRateLimiter: { kind: 'invitation-rate-limiter' },
				sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
			},
			{
				email: 'new.member@example.com',
				membershipRole: 'member',
				memberAccess: {
					memberPreset: 'viewer',
					capabilityOverrides: { calendar: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['11111111-1111-4111-8111-111111111111'] }
				},
				actorEmail: 'user@example.com',
				origin: 'http://localhost'
			}
		);
	});

	it('translates the update-permissions form into the use-case input shape', async () => {
		const result = await memberActions.updatePermissions({
			request: new Request('http://localhost/org/org-1/settings?/updatePermissions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					membershipId: '11111111-1111-4111-8111-111111111111',
					membershipRole: 'member',
					memberPreset: 'editor',
					'capabilityOverride:calendar': 'operate',
					scopeSetKind: 'groups',
					scopeSetGroupIds: '22222222-2222-4222-8222-222222222222'
				})
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({ permissionSuccess: true });
		expect(updateOrganizationMemberPermissionsMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				readOnlyGuard: undefined,
				settings: { kind: 'settings-port' },
				sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				membershipRole: 'member',
				memberAccess: {
					memberPreset: 'editor',
					capabilityOverrides: { calendar: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['22222222-2222-4222-8222-222222222222'] }
				},
				actorEmail: 'user@example.com'
			}
		);
	});

	it('redirects unauthenticated users to login before invoking the remove-member flow', async () => {
		await expect(
			memberActions.removeMember({
				request: new Request('http://localhost/org/org-1/settings?/removeMember', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ membershipId: 'membership-2' })
				}),
				locals: {},
				params: { orgId: 'org-1' },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});

		expect(buildRouteContextMock).not.toHaveBeenCalled();
		expect(removeOrganizationMemberMock).not.toHaveBeenCalled();
	});

	it('maps remove-member failures back into the memberError action payload', async () => {
		removeOrganizationMemberMock.mockRejectedValue(
			Object.assign(new Error('Cannot remove this member'), { status: 400 })
		);

		const result = await memberActions.removeMember({
			request: new Request('http://localhost/org/org-1/settings?/removeMember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ membershipId: 'membership-2' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { memberError: 'Cannot remove this member' }
		});
	});

	it('translates remove-member form data into the remove use-case input shape', async () => {
		const result = await memberActions.removeMember({
			request: new Request('http://localhost/org/org-1/settings?/removeMember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ membershipId: '11111111-1111-4111-8111-111111111111' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({ success: true });
		expect(removeOrganizationMemberMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				readOnlyGuard: undefined,
				settings: { kind: 'settings-port' },
				sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'user@example.com'
			}
		);
	});

	it('maps revoke-invite failures back into the inviteError action payload', async () => {
		revokeOrganizationInvitationMock.mockRejectedValue(
			Object.assign(new Error('Invalid invitation ID'), { status: 400 })
		);

		const result = await memberActions.revokeInvite({
			request: new Request('http://localhost/org/org-1/settings?/revokeInvite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ inviteId: 'bad-id' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { inviteError: 'Invalid invitation ID' }
		});
	});

	it('translates resend-invite form data into the resend use-case without creating another invitation', async () => {
		const result = await memberActions.resendInvite({
			request: new Request('http://localhost/org/org-1/settings?/resendInvite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ inviteId: '11111111-1111-4111-8111-111111111111' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: {}
			},
			params: { orgId: 'org-1' },
			cookies: {},
			getClientAddress: () => '127.0.0.1'
		} as never);

		expect(result).toEqual({
			success: true,
			inviteSuccess: true,
			inviteMessage: 'Invitation email resent.'
		});
		expect(resendOrganizationInvitationMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth', orgId: 'org-1' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				readOnlyGuard: undefined,
				settings: { kind: 'settings-port' },
				invitationDelivery: { kind: 'invitation-delivery-port' },
				invitationRateLimiter: { kind: 'invitation-rate-limiter' }
			},
			{
				inviteId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'user@example.com',
				origin: 'http://localhost'
			}
		);
		expect(inviteOrganizationMemberMock).not.toHaveBeenCalled();
	});
});
