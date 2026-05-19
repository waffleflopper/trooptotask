import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildLayoutContextMock,
	buildRouteContextMock,
	clearOrganizationUrlSlugMock,
	createSupabaseDataStoreMock,
	createSupabaseOrgSettingsAdministrationPortMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	deleteOrganizationUseCaseMock,
	fetchAuditLogPreviewMock,
	getAdminClientMock,
	inviteOrganizationMemberMock,
	loadWithContextMock,
	renameOrganizationMock,
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
	createSupabaseOrgSettingsMemberManagementPortMock: vi.fn(),
	deleteOrganizationUseCaseMock: vi.fn(),
	fetchAuditLogPreviewMock: vi.fn(),
	getAdminClientMock: vi.fn(),
	inviteOrganizationMemberMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	renameOrganizationMock: vi.fn(),
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

vi.mock('$lib/server/core/useCases/orgSettingsMemberManagement', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgSettingsMemberManagement')>(
		'$lib/server/core/useCases/orgSettingsMemberManagement'
	);

	return {
		...actual,
		inviteOrganizationMember: inviteOrganizationMemberMock,
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

import { actions, load } from './+page.server';

describe('org settings page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutContextMock.mockResolvedValue({
			auth: { requireManageMembers: vi.fn() }
		});
		buildRouteContextMock.mockResolvedValue({
			auth: { kind: 'auth', orgId: 'org-1' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' }
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
									scoped_group_id: null,
									created_at: '2026-04-26T12:00:00Z',
									can_view_calendar: true,
									can_edit_calendar: true,
									can_view_personnel: true,
									can_edit_personnel: true,
									can_view_training: true,
									can_edit_training: true,
									can_view_critical_tasks: true,
									can_edit_critical_tasks: true,
									can_view_onboarding: true,
									can_edit_onboarding: true,
									can_view_rating_scheme: true,
									can_edit_rating_scheme: true,
									can_manage_members: true
								}
							];
						}
						if (table === 'organization_invitations') return [{ id: 'invite-1', email: 'new@example.com' }];
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
						if (table === 'deletion_requests') return [{ id: 'request-1', status: 'pending' }];
						return [];
					})
				},
				rawStore: {
					findOne: vi.fn(async () => ({
						archive_retention_months: 42,
						loss_warning_window_days: 150,
						critical_tasks_default_expiration_months: 18,
						critical_tasks_expiring_soon_warning_days: 45
					}))
				},
				subscription: {
					getEffectiveTier: vi.fn(async () => ({ tier: 'free' })),
					getMonthlyExportCount: vi.fn(async () => 0)
				}
			})
		);
		createSupabaseOrgSettingsAdministrationPortMock.mockReturnValue({ kind: 'admin-port' });
		createSupabaseOrgSettingsMemberManagementPortMock.mockReturnValue({ kind: 'settings-port' });
		clearOrganizationUrlSlugMock.mockResolvedValue({ slugSuccess: true, orgUrlSlug: null });
		deleteOrganizationUseCaseMock.mockResolvedValue({ success: true });
		inviteOrganizationMemberMock.mockResolvedValue({ inviteSuccess: true });
		revokeOrganizationInvitationMock.mockResolvedValue({ success: true });
		removeOrganizationMemberMock.mockResolvedValue({ success: true });
		renameOrganizationMock.mockResolvedValue({ nameSuccess: true });
		transferOrganizationOwnershipMock.mockResolvedValue({ transferSuccess: true });
		updateOrganizationMemberPermissionsMock.mockResolvedValue({ permissionSuccess: true });
		updateOrganizationUrlSlugMock.mockResolvedValue({ slugSuccess: true, orgUrlSlug: '1-11-bde' });
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
			expect.objectContaining({ permission: 'privileged' })
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
			members: [{ email: 'owner@example.com' }],
			invitations: [{ id: 'invite-1' }],
			groups: [{ id: 'group-1', name: 'HQ' }],
			policies: {
				retentionMonths: 42,
				lossWarningWindowDays: 150,
				criticalTasksSettings: {
					defaultExpirationMonths: 18,
					expiringSoonWarningDays: 45
				}
			},
			archivedPersonnel: [{ id: 'person-1' }],
			approvalRequests: [{ id: 'request-1', status: 'pending' }],
			pendingApprovalsCount: 1,
			auditLog: {
				totalCount: 1,
				last30DaysCount: 1,
				availableActions: []
			}
		});
		expect(fetchAuditLogPreviewMock).toHaveBeenCalledWith(expect.anything(), { kind: 'admin-store' }, { limit: 9 });
	});

	it('denies governance workspace access through policy before loading settings data', async () => {
		const auditLog = vi.fn();
		const findMany = vi.fn();
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'member' },
				audit: { log: auditLog },
				store: { findMany },
				rawStore: { findOne: vi.fn() },
				subscription: {
					getEffectiveTier: vi.fn(async () => ({ tier: 'free' })),
					getMonthlyExportCount: vi.fn(async () => 0)
				}
			})
		);

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

		expect(findMany).not.toHaveBeenCalled();
		expect(auditLog).toHaveBeenCalledWith({
			action: 'policy.denied',
			resourceType: 'organization',
			details: {
				policyAction: 'organization.accessGovernance',
				reasonCode: 'denied:governance-role'
			},
			severity: 'warning'
		});
	});

	it('keeps member-management hints tied to governance role instead of legacy access flags', async () => {
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
				permissions: { canManageMembers: true }
			})
		} as never);

		expect(result).toMatchObject({ canManageMembers: false });
	});

	it('returns a name-specific success flag for organization rename', async () => {
		const result = await actions.updateName({
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
			actions.updateSlug({
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
			location: '/org/new-bde/settings'
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
			actions.clearSlug({
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
			location: '/org/org-1/settings'
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
				body: new URLSearchParams({ newOwnerId: '11111111-1111-4111-8111-111111111111' })
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
				administration: { kind: 'admin-port' }
			},
			{ newOwnerId: '11111111-1111-4111-8111-111111111111' }
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
				administration: { kind: 'admin-port' }
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
			actions.invite({
				request: new Request('http://localhost/org/org-1/settings?/invite', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ email: 'user@example.com', preset: 'viewer' })
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

		const result = await actions.invite({
			request: new Request('http://localhost/org/org-1/settings?/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ email: 'bad-email', preset: 'viewer' })
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

	it('translates the update-permissions form into the use-case input shape', async () => {
		const result = await actions.updatePermissions({
			request: new Request('http://localhost/org/org-1/settings?/updatePermissions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'custom',
					scopedGroupId: 'group-1',
					canViewCalendar: 'on',
					canEditPersonnel: 'on',
					canManageMembers: 'on'
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
				settings: { kind: 'settings-port' }
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				preset: 'custom',
				scopedGroupId: 'group-1',
				customPermissions: {
					canViewCalendar: true,
					canEditCalendar: false,
					canViewPersonnel: false,
					canEditPersonnel: true,
					canViewTraining: false,
					canEditTraining: false,
					canViewCriticalTasks: false,
					canEditCriticalTasks: false,
					canViewOnboarding: false,
					canEditOnboarding: false,
					canViewRatingScheme: false,
					canEditRatingScheme: false,
					canManageMembers: true
				},
				capabilityOverrides: {},
				accessScopeKind: null,
				accessScopeGroupIds: [],
				actorEmail: 'user@example.com'
			}
		);
	});

	it('maps revoke-invite failures back into the inviteError action payload', async () => {
		revokeOrganizationInvitationMock.mockRejectedValue(
			Object.assign(new Error('Invalid invitation ID'), { status: 400 })
		);

		const result = await actions.revokeInvite({
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
});
