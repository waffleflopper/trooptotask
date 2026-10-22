import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import { createTestContext } from '$lib/server/adapters/inMemory';

const {
	buildRouteRequestMock,
	createSettingsSensitiveNotificationContextMock,
	createRequestSensitiveActionContextMock,
	createSupabaseOrganizationDestructionPortMock,
	createSupabaseOrganizationOwnershipTransferPortMock,
	deleteOrganizationUseCaseMock,
	loadWithContextMock,
	transferOrganizationOwnershipMock
} = vi.hoisted(() => ({
	buildRouteRequestMock: vi.fn(),
	createSettingsSensitiveNotificationContextMock: vi.fn(),
	createRequestSensitiveActionContextMock: vi.fn(),
	createSupabaseOrganizationDestructionPortMock: vi.fn(),
	createSupabaseOrganizationOwnershipTransferPortMock: vi.fn(),
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
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return {
		...actual,
		buildRouteRequest: buildRouteRequestMock,
		createRequestSensitiveActionContext: createRequestSensitiveActionContextMock
	};
});

vi.mock('../settingsRequestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('../settingsRequestContexts.server')>(
		'../settingsRequestContexts.server'
	);
	return {
		...actual,
		createSettingsSensitiveNotificationContext: createSettingsSensitiveNotificationContextMock
	};
});

vi.mock('$features/organization/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/organization/index.server')>(
		'$features/organization/index.server'
	);
	return {
		...actual,
		createSupabaseOrganizationDestructionPort: createSupabaseOrganizationDestructionPortMock,
		deleteOrganization: deleteOrganizationUseCaseMock,
		createSupabaseOrganizationOwnershipTransferPort: createSupabaseOrganizationOwnershipTransferPortMock,
		transferOrganizationOwnership: transferOrganizationOwnershipMock
	};
});

import { actions, load } from './+page.server';
import { RequestFailure } from '$lib/errors';

const authContext = {
	auth: { kind: 'auth', orgId: 'org-1' },
	audit: { kind: 'audit' },
	notifications: { kind: 'notifications' },

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
		buildRouteRequestMock.mockResolvedValue(authContext);
		createSettingsSensitiveNotificationContextMock.mockReturnValue(authContext);
		createRequestSensitiveActionContextMock.mockReturnValue({
			auth: authContext.auth,
			audit: authContext.audit,
			sensitiveActionAuthorizer: authContext.sensitiveActionAuthorizer
		});
		createSupabaseOrganizationDestructionPortMock.mockReturnValue({ kind: 'admin-port' });
		createSupabaseOrganizationOwnershipTransferPortMock.mockReturnValue({ kind: 'transfer-port' });
		transferOrganizationOwnershipMock.mockResolvedValue({ transferSuccess: true });
		deleteOrganizationUseCaseMock.mockResolvedValue({ success: true });
	});

	it('redirects non-owners away from danger settings without reading candidates or counts', async () => {
		const findMany = vi.fn();
		const countRows = vi.fn();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'admin', canManageMembers: true },
				organizationSettings: { listOwnershipCandidateMemberships: findMany },
				unitCounts: { countRows, countRatingSchemeEntries: countRows }
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
		expect(countRows).not.toHaveBeenCalled();
	});

	it('gives owners the transfer candidates and streams what deleting the unit destroys', async () => {
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
		const testContext = createTestContext({ auth: { orgId: 'org-1', role: 'owner' } });
		testContext.rawStore.seed('personnel', [
			{ id: 'p1', organization_id: 'org-1', archived_at: null },
			{ id: 'p2', organization_id: 'org-1', archived_at: null },
			{ id: 'p3', organization_id: 'org-1', archived_at: '2026-01-01T00:00:00.000Z' },
			{ id: 'p4', organization_id: 'org-2', archived_at: null }
		]);
		testContext.rawStore.seed('personnel_trainings', [
			{ id: 't1', organization_id: 'org-1' },
			{ id: 't2', organization_id: 'org-1' },
			{ id: 't3', organization_id: 'org-1' }
		]);
		testContext.rawStore.seed('organization_memberships', [
			{ id: 'member-1', organization_id: 'org-1' },
			{ id: 'owner-1', organization_id: 'org-1' }
		]);
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1', role: 'owner', canManageMembers: true },
				organizationSettings: { listOwnershipCandidateMemberships: findMany },
				unitCounts: testContext.unitCounts
			})
		);

		const result = (await load({
			locals: {},
			cookies: {},
			parent: async () =>
				createReadyAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org',
					role: 'owner'
				})
		} as never)) as { dangerSettings: { destructionCounts: Promise<unknown> } };

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Org',
			dangerSettings: {
				transferOwnershipCandidates: [
					{
						id: 'member-1',
						userId: 'user-2',
						email: 'next-owner@example.com',
						membershipRole: 'admin'
					}
				]
			}
		});
		expect(await result.dangerSettings.destructionCounts).toEqual({
			activePersonnel: 2,
			trainingRecords: 3,
			members: 2,
			archivedPersonnel: 1
		});
	});

	it('maps ownership-transfer failures back into the transferError action payload', async () => {
		transferOrganizationOwnershipMock.mockRejectedValue(new RequestFailure(400, 'Invalid user ID'));

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
			new RequestFailure(403, 'Please confirm your identity before continuing.', {
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
		deleteOrganizationUseCaseMock.mockRejectedValue(new RequestFailure(400, 'Organization name does not match'));

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

		expect(buildRouteRequestMock).not.toHaveBeenCalled();
		expect(transferOrganizationOwnershipMock).not.toHaveBeenCalled();
		expect(deleteOrganizationUseCaseMock).not.toHaveBeenCalled();
	});
});
