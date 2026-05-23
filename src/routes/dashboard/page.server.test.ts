import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createSupabaseDashboardOrgAccessPortMock,
	createSupabaseNotificationAdapterMock,
	loadDashboardOrgAccessMock,
	acceptDashboardInvitationMock,
	declineDashboardInvitationMock
} = vi.hoisted(() => ({
	createSupabaseDashboardOrgAccessPortMock: vi.fn(),
	createSupabaseNotificationAdapterMock: vi.fn(),
	loadDashboardOrgAccessMock: vi.fn(),
	acceptDashboardInvitationMock: vi.fn(),
	declineDashboardInvitationMock: vi.fn()
}));

vi.mock('$lib/server/adapters/supabaseDashboardOrgAccess', () => ({
	createSupabaseDashboardOrgAccessPort: createSupabaseDashboardOrgAccessPortMock
}));

vi.mock('$lib/server/adapters/supabaseNotification', () => ({
	createSupabaseNotificationAdapter: createSupabaseNotificationAdapterMock
}));

vi.mock('$lib/server/core/useCases/dashboardOrgAccess', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/dashboardOrgAccess')>(
		'$lib/server/core/useCases/dashboardOrgAccess'
	);

	return {
		...actual,
		loadDashboardOrgAccess: loadDashboardOrgAccessMock,
		acceptDashboardInvitation: acceptDashboardInvitationMock,
		declineDashboardInvitation: declineDashboardInvitationMock
	};
});

import { actions, load } from './+page.server';

describe('dashboard page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createSupabaseDashboardOrgAccessPortMock.mockReturnValue({ kind: 'dashboard-port' });
		createSupabaseNotificationAdapterMock.mockReturnValue({ notifyAdmins: vi.fn(), notifyUser: vi.fn() });
		loadDashboardOrgAccessMock.mockResolvedValue({
			organizations: [],
			pendingInvitations: [],
			redirectTo: null
		});
		acceptDashboardInvitationMock.mockResolvedValue({ success: true, accepted: true });
		declineDashboardInvitationMock.mockResolvedValue({ success: true, declined: true });
	});

	it('redirects unauthenticated users to login before loading dashboard access', async () => {
		await expect(
			load({
				locals: {},
				url: new URL('http://localhost/dashboard')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});

		expect(loadDashboardOrgAccessMock).not.toHaveBeenCalled();
	});

	it('redirects to the use-case-provided destination when dashboard access resolves to a redirect', async () => {
		loadDashboardOrgAccessMock.mockResolvedValue({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member' }],
			pendingInvitations: [],
			redirectTo: '/org/org-1'
		});

		await expect(
			load({
				locals: {
					user: { id: 'user-1', email: 'USER@EXAMPLE.COM' }
				},
				url: new URL('http://localhost/dashboard')
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1'
		});

		expect(createSupabaseDashboardOrgAccessPortMock).toHaveBeenCalledWith({
			user: { id: 'user-1', email: 'USER@EXAMPLE.COM' }
		});
		expect(loadDashboardOrgAccessMock).toHaveBeenCalledWith(
			{ kind: 'dashboard-port' },
			{
				userId: 'user-1',
				email: 'USER@EXAMPLE.COM',
				forceShow: false
			}
		);
	});

	it('returns a 400 action failure when invitationId is missing', async () => {
		const result = await actions.acceptInvitation({
			request: new Request('http://localhost/dashboard?/acceptInvitation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams()
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' }
			}
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Invitation ID required' }
		});
		expect(acceptDashboardInvitationMock).not.toHaveBeenCalled();
	});

	it('maps use-case failures back into action failures for acceptInvitation', async () => {
		const err = Object.assign(new Error('Invitation not found'), { status: 404 });
		acceptDashboardInvitationMock.mockRejectedValue(err);

		const result = await actions.acceptInvitation({
			request: new Request('http://localhost/dashboard?/acceptInvitation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ invitationId: 'invite-1' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' }
			}
		} as never);

		expect(result).toMatchObject({
			status: 404,
			data: { error: 'Invitation not found' }
		});
		expect(createSupabaseNotificationAdapterMock).toHaveBeenCalledOnce();
	});

	it('delegates declineInvitation through the dashboard org-access boundary', async () => {
		const result = await actions.declineInvitation({
			request: new Request('http://localhost/dashboard?/declineInvitation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ invitationId: 'invite-1' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' }
			}
		} as never);

		expect(result).toEqual({ success: true, declined: true });
		expect(declineDashboardInvitationMock).toHaveBeenCalledWith(
			{
				dashboard: { kind: 'dashboard-port' },
				notifications: { notifyAdmins: expect.any(Function), notifyUser: expect.any(Function) }
			},
			{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
		);
	});
});
