import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from '$lib/test-support/appShellRouteData';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
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

import { load } from './+layout.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

describe('settings layout server load', () => {
	beforeEach(() => {
		loadWithContextMock.mockReset();
	});

	it('redirects the settings index before loading the shell', async () => {
		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {},
				route: { id: '/org/[orgId]/settings' },
				parent: async () =>
					createReadyAppShellRouteData({
						orgId: 'org-1',
						orgName: 'Test Org',
						orgUrlSegment: 'test-org'
					})
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/org/test-org/settings/general' });

		expect(loadWithContextMock).not.toHaveBeenCalled();
	});

	it('redirects suspended organizations before loading the shell', async () => {
		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {},
				route: { id: '/org/[orgId]/settings' },
				parent: async () =>
					createSuspendedAppShellRouteData({
						orgId: 'org-1',
						orgName: 'Test Org',
						orgUrlSegment: 'test-org'
					})
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/org/test-org/suspended' });

		expect(loadWithContextMock).not.toHaveBeenCalled();
	});

	it('authorizes organization governance access through the policy evaluator', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			route: { id: '/org/[orgId]/settings/general' },
			parent: async () =>
				createReadyAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org'
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
			canAccessOrganizationGovernance: true,
			settingsShell: {
				organization: {
					id: 'org-1',
					name: 'Test Org',
					urlSlug: 'test-org',
					urlSegment: 'test-org'
				},
				currentMember: {
					role: 'admin',
					isOwner: false,
					canManageMembers: true
				},
				navBadges: {
					pendingInvitationsCount: 0,
					archivedPersonnelCount: 0,
					pendingApprovalsCount: 0
				}
			}
		});
	});

	it('returns shell badge counts without exposing invitation or archived personnel rows', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('organization_invitations', [
			{ id: 'invite-1', organization_id: 'org-1', status: 'pending' },
			{ id: 'invite-2', organization_id: 'org-1', status: 'pending' },
			{ id: 'invite-accepted', organization_id: 'org-1', status: 'accepted' }
		]);
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: 'org-1', archived_at: '2026-04-01T12:00:00Z' },
			{ id: 'person-2', organization_id: 'org-1', archived_at: '2026-04-02T12:00:00Z' },
			{ id: 'person-3', organization_id: 'org-1', archived_at: '2026-04-03T12:00:00Z' },
			{ id: 'active-person', organization_id: 'org-1', archived_at: null }
		]);
		ctx.store.seed('deletion_requests', [
			{ id: 'approval-1', organization_id: 'org-1', status: 'pending' },
			{ id: 'approval-2', organization_id: 'org-1', status: 'pending' },
			{ id: 'approval-approved', organization_id: 'org-1', status: 'approved' }
		]);
		const findManyWithCount = vi.spyOn(ctx.store, 'findManyWithCount');
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			route: { id: '/org/[orgId]/settings/general' },
			parent: async () =>
				createReadyAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org'
				})
		} as never);

		expect(result).toMatchObject({
			settingsShell: {
				navBadges: {
					pendingInvitationsCount: 2,
					archivedPersonnelCount: 3,
					pendingApprovalsCount: 2
				}
			}
		});
		expect(result).not.toHaveProperty('settingsShell.invitations');
		expect(result).not.toHaveProperty('settingsShell.archivedPersonnel');
		expect(findManyWithCount).toHaveBeenCalledWith(
			'organization_invitations',
			'org-1',
			{ status: 'pending' },
			{
				select: 'id',
				limit: 0
			}
		);
		expect(findManyWithCount).toHaveBeenCalledWith('personnel', 'org-1', undefined, {
			select: 'id',
			isNull: { archived_at: false },
			limit: 0
		});
		expect(findManyWithCount).toHaveBeenCalledWith(
			'deletion_requests',
			'org-1',
			{ status: 'pending' },
			{ select: 'id', limit: 0 }
		);
	});

	it('lets policy denials block non-governance members before layout data is returned', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {},
				route: { id: '/org/[orgId]/settings/general' },
				parent: async () => createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Org' })
			} as never)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have permission to perform this action' }
		});
	});
});
