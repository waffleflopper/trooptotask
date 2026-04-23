import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildLayoutContextMock,
	buildRouteContextMock,
	createSupabaseOrgSettingsAdministrationPortMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	deleteOrganizationUseCaseMock,
	inviteOrganizationMemberMock,
	revokeOrganizationInvitationMock,
	removeOrganizationMemberMock,
	transferOrganizationOwnershipMock,
	updateOrganizationMemberPermissionsMock
} = vi.hoisted(() => ({
	buildLayoutContextMock: vi.fn(),
	buildRouteContextMock: vi.fn(),
	createSupabaseOrgSettingsAdministrationPortMock: vi.fn(),
	createSupabaseOrgSettingsMemberManagementPortMock: vi.fn(),
	deleteOrganizationUseCaseMock: vi.fn(),
	inviteOrganizationMemberMock: vi.fn(),
	revokeOrganizationInvitationMock: vi.fn(),
	removeOrganizationMemberMock: vi.fn(),
	transferOrganizationOwnershipMock: vi.fn(),
	updateOrganizationMemberPermissionsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildLayoutContext: buildLayoutContextMock,
		buildRouteContext: buildRouteContextMock
	};
});

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
		transferOrganizationOwnership: transferOrganizationOwnershipMock,
		deleteOrganization: deleteOrganizationUseCaseMock
	};
});

import { actions } from './+page.server';

describe('org settings page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutContextMock.mockResolvedValue({
			auth: { requireManageMembers: vi.fn() }
		});
		buildRouteContextMock.mockResolvedValue({
			auth: { kind: 'auth' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' }
		});
		createSupabaseOrgSettingsAdministrationPortMock.mockReturnValue({ kind: 'admin-port' });
		createSupabaseOrgSettingsMemberManagementPortMock.mockReturnValue({ kind: 'settings-port' });
		deleteOrganizationUseCaseMock.mockResolvedValue({ success: true });
		inviteOrganizationMemberMock.mockResolvedValue({ inviteSuccess: true });
		revokeOrganizationInvitationMock.mockResolvedValue({ success: true });
		removeOrganizationMemberMock.mockResolvedValue({ success: true });
		transferOrganizationOwnershipMock.mockResolvedValue({ transferSuccess: true });
		updateOrganizationMemberPermissionsMock.mockResolvedValue({ permissionSuccess: true });
	});

	it('returns a name-specific success flag for organization rename', async () => {
		const eqMock = vi.fn().mockResolvedValue({ error: null });
		const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
		const fromMock = vi.fn().mockReturnValue({ update: updateMock });

		const result = await actions.updateName({
			request: new Request('http://localhost/org/org-1/settings?/updateName', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: 'Renamed Org' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: { from: fromMock }
			},
			params: { orgId: 'org-1' },
			cookies: {}
		} as never);

		expect(result).toEqual({ nameSuccess: true });
		expect(fromMock).toHaveBeenCalledWith('organizations');
		expect(updateMock).toHaveBeenCalledWith({ name: 'Renamed Org' });
		expect(eqMock).toHaveBeenCalledWith('id', 'org-1');
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
				auth: { kind: 'auth' },
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
				auth: { kind: 'auth' },
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
				auth: { kind: 'auth' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
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
					canViewLeadersBook: false,
					canEditLeadersBook: false,
					canManageMembers: true
				},
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
