import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

const {
	buildRouteContextMock,
	createSupabaseOrgSettingsAdministrationPortMock,
	deleteOrganizationUseCaseMock,
	loadWithContextMock,
	transferOrganizationOwnershipMock
} = vi.hoisted(() => ({
	buildRouteContextMock: vi.fn(),
	createSupabaseOrgSettingsAdministrationPortMock: vi.fn(),
	deleteOrganizationUseCaseMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	transferOrganizationOwnershipMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildRouteContext: buildRouteContextMock,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/adapters/supabaseOrgSettingsAdministration', () => ({
	createSupabaseOrgSettingsAdministrationPort: createSupabaseOrgSettingsAdministrationPortMock
}));

vi.mock('$lib/server/core/useCases/orgSettingsAdministration', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgSettingsAdministration')>(
		'$lib/server/core/useCases/orgSettingsAdministration'
	);

	return {
		...actual,
		deleteOrganization: deleteOrganizationUseCaseMock,
		transferOrganizationOwnership: transferOrganizationOwnershipMock
	};
});

import { actions, load } from './+page.server';

const authContext = {
	auth: { kind: 'auth', orgId: 'org-1' },
	audit: { kind: 'audit' },
	notifications: { kind: 'notifications' },
	readOnlyGuard: { kind: 'read-only-guard' },
	sensitiveActionAuthorizer: { kind: 'sensitive-action-authorizer' }
};

function actionEvent(
	actionName: string,
	body: URLSearchParams,
	locals: Record<string, unknown> = { user: { id: 'user-1', email: 'user@example.com' }, supabase: {} }
) {
	return {
		request: new Request(`http://localhost/org/org-1/settings/danger?/${actionName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		}),
		locals,
		params: { orgId: 'org-1' },
		cookies: {},
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('danger settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildRouteContextMock.mockResolvedValue(authContext);
		createSupabaseOrgSettingsAdministrationPortMock.mockReturnValue({ kind: 'admin-port' });
		transferOrganizationOwnershipMock.mockResolvedValue({ transferSuccess: true });
		deleteOrganizationUseCaseMock.mockResolvedValue({ success: true });
	});

	it('redirects non-owners away from danger settings without loading transfer candidates', async () => {
		const findMany = vi.fn();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'admin', canManageMembers: true },
				store: { findMany }
			})
		);

		await expect(
			load({
				locals: {},
				cookies: {},
				parent: async () =>
					createReadyAppShellRouteData({
						orgId: 'org-1',
						orgName: 'Test Org',
						orgUrlSegment: 'test-org',
						role: 'admin'
					})
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/test-org/settings/general'
		});
		expect(findMany).not.toHaveBeenCalled();
	});

	it('loads owner danger settings with shared page context and ownership candidates', async () => {
		const findMany = vi.fn().mockResolvedValue([
			{
				id: 'member-1',
				user_id: 'user-2',
				email: 'next-owner@example.com',
				role: 'admin'
			},
			{
				id: 'owner-1',
				user_id: 'user-1',
				email: 'owner@example.com',
				role: 'owner'
			}
		]);
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'owner', canManageMembers: true },
				store: { findMany }
			})
		);

		const result = await load({
			locals: {},
			cookies: {},
			parent: async () =>
				createReadyAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org',
					role: 'owner'
				})
		} as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgUrlSlug: 'test-org',
			orgName: 'Test Org',
			isAdmin: false,
			dangerSettings: {
				currentMember: {
					role: 'owner',
					isOwner: true,
					canManageMembers: true
				},
				sections: {
					dangerZone: {
						transferOwnershipCandidates: [
							{
								id: 'member-1',
								userId: 'user-2',
								email: 'next-owner@example.com',
								membershipRole: 'admin'
							}
						],
						commands: {
							canTransferOwnership: true,
							canDeleteOrganization: true
						}
					}
				}
			}
		});
		expect(findMany).toHaveBeenCalledWith('organization_memberships', 'org-1', undefined, {
			select: 'id, user_id, email, role'
		});
	});

	it('maps ownership-transfer failures back into the transferError action payload', async () => {
		transferOrganizationOwnershipMock.mockRejectedValue(Object.assign(new Error('Invalid user ID'), { status: 400 }));

		const result = await actions.transferOwnership(
			actionEvent('transferOwnership', new URLSearchParams({ newOwnerId: 'bad-id' }))
		);

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

		const result = await actions.transferOwnership(
			actionEvent(
				'transferOwnership',
				new URLSearchParams({
					newOwnerId: '11111111-1111-4111-8111-111111111111',
					confirmTransferEmail: 'new-owner@example.com'
				})
			)
		);

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

	it('redirects after the destructive org administration use case succeeds', async () => {
		await expect(
			actions.deleteOrganization(
				actionEvent('deleteOrganization', new URLSearchParams({ confirmName: '  Test Org  ' }))
			)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?show=all'
		});
	});

	it('maps destructive org-operation failures back into the deleteError action payload', async () => {
		deleteOrganizationUseCaseMock.mockRejectedValue(
			Object.assign(new Error('Organization name does not match'), { status: 400 })
		);

		const result = await actions.deleteOrganization(
			actionEvent('deleteOrganization', new URLSearchParams({ confirmName: 'Other Org' }))
		);

		expect(result).toMatchObject({
			status: 400,
			data: { deleteError: 'Organization name does not match' }
		});
	});

	it('redirects unauthenticated users before invoking danger actions', async () => {
		await expect(
			actions.transferOwnership(actionEvent('transferOwnership', new URLSearchParams({ newOwnerId: 'user-2' }), {}))
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });

		await expect(
			actions.deleteOrganization(
				actionEvent('deleteOrganization', new URLSearchParams({ confirmName: 'Test Org' }), {})
			)
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });

		expect(buildRouteContextMock).not.toHaveBeenCalled();
		expect(transferOrganizationOwnershipMock).not.toHaveBeenCalled();
		expect(deleteOrganizationUseCaseMock).not.toHaveBeenCalled();
	});
});
