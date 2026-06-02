import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

import { buildCommonSettingsPageData, buildSettingsPageOrganization, loadSettingsPage } from './settingsLoad.server';
import type { AppShellRouteData } from '$lib/server/core/orgShell';

const effectiveTier = {
	tier: 'free',
	source: 'default',
	personnelCount: 0,
	personnelCap: 20,
	isReadOnly: false,
	readOnlyReason: null,
	giftExpiresAt: null,
	giftTier: null
} as const;

function readyParent(overrides: Partial<AppShellRouteData['shell']> = {}): AppShellRouteData {
	return {
		shell: {
			kind: 'ready',
			org: { id: 'org-1', name: 'Test Org', urlSegment: 'test-org' },
			user: { id: 'user-1' },
			member: {
				membershipId: 'membership-1',
				role: 'admin',
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' },
				isOwner: false,
				isAdmin: true
			},
			state: { effectiveTier, isReadOnly: false, orgSuspended: false },
			preferences: {} as never,
			announcements: [],
			...overrides
		}
	} as AppShellRouteData;
}

describe('settings load helpers', () => {
	beforeEach(() => {
		loadWithContextMock.mockReset();
	});

	it('builds shared settings page data from parent org context', () => {
		const parentData = readyParent();

		expect(buildCommonSettingsPageData(parentData)).toEqual({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgUrlSlug: 'test-org',
			orgName: 'Test Org',
			effectiveTier,
			isAdmin: true
		});
		expect(buildSettingsPageOrganization(parentData)).toEqual({
			id: 'org-1',
			name: 'Test Org',
			urlSlug: 'test-org',
			urlSegment: 'test-org',
			effectiveTier
		});
	});

	it('wraps section loaders with the shared governance context and common props', async () => {
		const ctx = { auth: { orgId: 'org-1' } };
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) => config.fn(ctx));

		const result = await loadSettingsPage(
			{
				locals: { user: { id: 'user-1' } },
				cookies: { get: vi.fn() },
				parent: async () =>
					readyParent({
						org: { id: 'org-1', name: 'Test Org', urlSegment: 'org-1' },
						member: {
							...(readyParent().shell as Extract<AppShellRouteData['shell'], { kind: 'ready' }>).member,
							isAdmin: false
						}
					} as never)
			} as never,
			async (receivedCtx, { common, organization }) => ({
				sectionSettings: {
					authOrgId: receivedCtx.auth.orgId,
					commonOrgId: common.orgId,
					organizationUrlSegment: organization.urlSegment
				}
			})
		);

		expect(loadWithContextMock).toHaveBeenCalledWith(
			{ user: { id: 'user-1' } },
			{ get: expect.any(Function) },
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
				policyResource: { kind: 'organization' }
			})
		);
		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			orgUrlSlug: null,
			orgName: 'Test Org',
			isAdmin: false,
			sectionSettings: {
				authOrgId: 'org-1',
				commonOrgId: 'org-1',
				organizationUrlSegment: 'org-1'
			}
		});
	});

	it('returns no page data when the parent org layout reports suspension', async () => {
		const result = await loadSettingsPage(
			{
				locals: {},
				cookies: { get: vi.fn() },
				parent: async () => ({
					shell: {
						kind: 'suspended',
						org: { id: 'org-1', name: 'Test Org', urlSegment: 'test-org' },
						state: { isReadOnly: true, orgSuspended: true }
					}
				})
			} as never,
			() => ({ sectionSettings: true })
		);

		expect(result).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});
});
