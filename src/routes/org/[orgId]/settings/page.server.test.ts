import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildRouteContextMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	inviteOrganizationMemberMock,
	revokeOrganizationInvitationMock,
	removeOrganizationMemberMock,
	updateOrganizationMemberPermissionsMock
} = vi.hoisted(() => ({
	buildRouteContextMock: vi.fn(),
	createSupabaseOrgSettingsMemberManagementPortMock: vi.fn(),
	inviteOrganizationMemberMock: vi.fn(),
	revokeOrganizationInvitationMock: vi.fn(),
	removeOrganizationMemberMock: vi.fn(),
	updateOrganizationMemberPermissionsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildRouteContext: buildRouteContextMock
	};
});

vi.mock('$lib/server/adapters/supabaseOrgSettingsMemberManagement', () => ({
	createSupabaseOrgSettingsMemberManagementPort: createSupabaseOrgSettingsMemberManagementPortMock
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

import { actions } from './+page.server';

describe('org settings page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildRouteContextMock.mockResolvedValue({
			auth: { kind: 'auth' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' }
		});
		createSupabaseOrgSettingsMemberManagementPortMock.mockReturnValue({ kind: 'settings-port' });
		inviteOrganizationMemberMock.mockResolvedValue({ inviteSuccess: true });
		revokeOrganizationInvitationMock.mockResolvedValue({ success: true });
		removeOrganizationMemberMock.mockResolvedValue({ success: true });
		updateOrganizationMemberPermissionsMock.mockResolvedValue({ permissionSuccess: true });
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
