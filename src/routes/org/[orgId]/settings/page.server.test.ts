import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildLayoutContextMock,
	buildRouteContextMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	inviteOrganizationMemberMock,
	revokeOrganizationInvitationMock,
	removeOrganizationMemberMock,
	updateOrganizationMemberPermissionsMock
} = vi.hoisted(() => ({
	buildLayoutContextMock: vi.fn(),
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
		buildLayoutContext: buildLayoutContextMock,
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
		buildLayoutContextMock.mockResolvedValue({
			auth: { requireManageMembers: vi.fn() }
		});
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

	it('normalizes the delete confirmation name before deleting the organization', async () => {
		const requireOwner = vi.fn();
		buildLayoutContextMock.mockResolvedValue({
			auth: { requireOwner }
		});
		const selectEqMock = vi.fn().mockReturnValue({
			single: vi.fn().mockResolvedValue({
				data: { name: 'Test   Org' },
				error: null
			})
		});
		const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
		const fromMock = vi.fn((table: string) => {
			if (table === 'organizations') {
				return {
					select: vi.fn().mockReturnValue({ eq: selectEqMock }),
					delete: vi.fn().mockReturnValue({ eq: deleteEqMock })
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		});

		await expect(
			actions.deleteOrganization({
				request: new Request('http://localhost/org/org-1/settings?/deleteOrganization', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ confirmName: '  Test Org  ' })
				}),
				locals: {
					user: { id: 'user-1', email: 'user@example.com' },
					supabase: { from: fromMock }
				},
				params: { orgId: 'org-1' },
				cookies: {}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?show=all'
		});

		expect(requireOwner).toHaveBeenCalled();
		expect(selectEqMock).toHaveBeenCalledWith('id', 'org-1');
		expect(deleteEqMock).toHaveBeenCalledWith('id', 'org-1');
	});

	it('returns a delete error when the normalized confirmation name does not match', async () => {
		const requireOwner = vi.fn();
		buildLayoutContextMock.mockResolvedValue({
			auth: { requireOwner }
		});
		const deleteEqMock = vi.fn();
		const fromMock = vi.fn((table: string) => {
			if (table === 'organizations') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							single: vi.fn().mockResolvedValue({
								data: { name: 'Test Org' },
								error: null
							})
						})
					}),
					delete: vi.fn().mockReturnValue({ eq: deleteEqMock })
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		});

		const result = await actions.deleteOrganization({
			request: new Request('http://localhost/org/org-1/settings?/deleteOrganization', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ confirmName: 'Other Org' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' },
				supabase: { from: fromMock }
			},
			params: { orgId: 'org-1' },
			cookies: {}
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { deleteError: 'Organization name does not match' }
		});
		expect(requireOwner).toHaveBeenCalled();
		expect(deleteEqMock).not.toHaveBeenCalled();
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
