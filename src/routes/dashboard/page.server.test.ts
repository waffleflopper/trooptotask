import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createSupabaseDashboardOrgAccessPortMock,
	createRequestNotificationDeliveryMock,
	loadDashboardOrgAccessMock,
	acceptDashboardInvitationMock,
	declineDashboardInvitationMock
} = vi.hoisted(() => ({
	createSupabaseDashboardOrgAccessPortMock: vi.fn(),
	createRequestNotificationDeliveryMock: vi.fn(),
	loadDashboardOrgAccessMock: vi.fn(),
	acceptDashboardInvitationMock: vi.fn(),
	declineDashboardInvitationMock: vi.fn()
}));

vi.mock('$lib/server/adapters/requestContexts.server', () => ({
	createRequestNotificationDelivery: createRequestNotificationDeliveryMock
}));

vi.mock('$features/organization/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/organization/index.server')>(
		'$features/organization/index.server'
	);

	return {
		...actual,
		createSupabaseDashboardOrgAccessPort: createSupabaseDashboardOrgAccessPortMock,
		loadDashboardOrgAccess: loadDashboardOrgAccessMock,
		acceptDashboardInvitation: acceptDashboardInvitationMock,
		declineDashboardInvitation: declineDashboardInvitationMock
	};
});

import { actions, load } from './+page.server';
import { RequestFailure } from '$lib/errors';

describe('dashboard page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createSupabaseDashboardOrgAccessPortMock.mockReturnValue({ kind: 'dashboard-port' });
		createRequestNotificationDeliveryMock.mockReturnValue({ notifyAdmins: vi.fn(), notifyUser: vi.fn() });
		loadDashboardOrgAccessMock.mockResolvedValue({
			organizations: [],
			pendingInvitations: [],
			landing: { kind: 'list' }
		});
		acceptDashboardInvitationMock.mockResolvedValue({ success: true, accepted: true });
		declineDashboardInvitationMock.mockResolvedValue({ success: true, declined: true });
	});

	it.each(['acceptInvitation', 'declineInvitation'] as const)(
		'%s denies anonymous submissions before effects',
		async (action) => {
			await expect(
				actions[action]({
					locals: {},
					request: new Request('http://localhost/dashboard', {
						method: 'POST',
						body: new URLSearchParams({ invitationId: 'invite-a' })
					})
				} as never)
			).rejects.toMatchObject({ status: 303, location: '/auth/login' });
			expect(createSupabaseDashboardOrgAccessPortMock).not.toHaveBeenCalled();
			expect(acceptDashboardInvitationMock).not.toHaveBeenCalled();
			expect(declineDashboardInvitationMock).not.toHaveBeenCalled();
		}
	);

	it.each(['acceptInvitation', 'declineInvitation'] as const)(
		'%s uses the authenticated actor despite submitted identity and Organization fields',
		async (action) => {
			const result = await actions[action]({
				locals: { user: { id: 'verified-user', email: 'verified@example.com' } },
				request: new Request('http://localhost/dashboard', {
					method: 'POST',
					body: new URLSearchParams({
						invitationId: 'invite-a',
						userId: 'victim',
						email: 'victim@example.com',
						organizationId: 'org-victim'
					})
				}),
				getClientAddress: () => '203.0.113.10'
			} as never);
			expect(result).toMatchObject({ success: true });
			expect(
				action === 'acceptInvitation' ? acceptDashboardInvitationMock : declineDashboardInvitationMock
			).toHaveBeenCalledWith(expect.anything(), {
				invitationId: 'invite-a',
				userId: 'verified-user',
				email: 'verified@example.com'
			});
		}
	);

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

	it('redirects to the destination the landing decision chose', async () => {
		loadDashboardOrgAccessMock.mockResolvedValue({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member' }],
			pendingInvitations: [],
			landing: { kind: 'redirect', to: '/org/org-1' }
		});

		await expect(
			load({
				locals: { user: { id: 'user-1', email: 'USER@EXAMPLE.COM' } },
				cookies: { get: () => undefined },
				url: new URL('http://localhost/dashboard')
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/org/org-1' });
	});

	it('hands the decision only the last Organization remembered for the signed-in person', async () => {
		const cookie = (value: string) => ({ get: (name: string) => (name === 'last_organization' ? value : undefined) });
		const call = (value: string, userId: string) =>
			load({
				locals: { user: { id: userId, email: 'user@example.com' } },
				cookies: cookie(value),
				url: new URL('http://localhost/dashboard?show=all')
			} as never);

		await call('user-1:org-2', 'user-1');
		await call('user-1:org-2', 'user-2');

		expect(loadDashboardOrgAccessMock.mock.calls.map(([, input]) => input.lastOrganizationId)).toEqual(['org-2', null]);
		expect(loadDashboardOrgAccessMock.mock.calls[0][1]).toMatchObject({
			userId: 'user-1',
			email: 'user@example.com',
			forceShow: true
		});
	});

	it.each([
		{ landing: { kind: 'list' }, noOrganization: false },
		{ landing: { kind: 'no-organization' }, noOrganization: true }
	])('renders the $landing.kind landing in place', async ({ landing, noOrganization }) => {
		loadDashboardOrgAccessMock.mockResolvedValue({ organizations: [], pendingInvitations: [], landing });

		await expect(
			load({
				locals: { user: { id: 'user-1', email: 'user@example.com' } },
				cookies: { get: () => undefined },
				url: new URL('http://localhost/dashboard')
			} as never)
		).resolves.toEqual({
			userEmail: 'user@example.com',
			noOrganization,
			organizations: [],
			pendingInvitations: []
		});
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
		const err = new RequestFailure(404, 'Invitation not found');
		acceptDashboardInvitationMock.mockRejectedValue(err);

		const result = await actions.acceptInvitation({
			request: new Request('http://localhost/dashboard?/acceptInvitation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ invitationId: 'invite-1' })
			}),
			locals: {
				user: { id: 'user-1', email: 'user@example.com' }
			},
			getClientAddress: () => '203.0.113.10'
		} as never);

		expect(result).toMatchObject({
			status: 404,
			data: { error: 'Invitation not found' }
		});
		expect(createRequestNotificationDeliveryMock).toHaveBeenCalledOnce();
	});
});
