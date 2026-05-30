import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

import { buildCommonSettingsPageData, buildSettingsPageOrganization, loadSettingsPage } from './settingsLoad.server';
import type { OrganizationMemberPermissions } from '$lib/types';

const permissions: OrganizationMemberPermissions = {
	canViewCalendar: true,
	canEditCalendar: false,
	canViewPersonnel: true,
	canEditPersonnel: false,
	canViewTraining: true,
	canEditTraining: false,
	canViewCriticalTasks: true,
	canEditCriticalTasks: false,
	canViewOnboarding: true,
	canEditOnboarding: false,
	canViewRatingScheme: true,
	canEditRatingScheme: false,
	canManageMembers: true
};

describe('settings load helpers', () => {
	beforeEach(() => {
		loadWithContextMock.mockReset();
	});

	it('builds shared settings page data from parent org context', () => {
		const parentData = {
			orgId: 'org-1',
			orgName: 'Test Org',
			orgUrlSegment: 'test-org',
			allOrgs: [{ id: 'org-1', name: 'Test Org', role: 'owner', urlSegment: 'test-org' }],
			isAdmin: true,
			effectiveTier: null,
			permissions
		};

		expect(buildCommonSettingsPageData(parentData, permissions)).toEqual({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgUrlSlug: 'test-org',
			orgName: 'Test Org',
			effectiveTier: null,
			permissions,
			allOrgs: [{ id: 'org-1', name: 'Test Org', role: 'owner', urlSegment: 'test-org' }],
			isAdmin: true
		});
		expect(buildSettingsPageOrganization(parentData)).toEqual({
			id: 'org-1',
			name: 'Test Org',
			urlSlug: 'test-org',
			urlSegment: 'test-org',
			effectiveTier: null
		});
	});

	it('wraps section loaders with the shared governance context and common props', async () => {
		const ctx = { auth: { orgId: 'org-1' } };
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) => config.fn(ctx));

		const result = await loadSettingsPage(
			{
				locals: { user: { id: 'user-1' } },
				cookies: { get: vi.fn() },
				parent: async () => ({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'org-1',
					allOrgs: [],
					isAdmin: false,
					effectiveTier: null,
					permissions
				})
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
			permissions,
			allOrgs: [],
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
					orgSuspended: true,
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org'
				})
			} as never,
			() => ({ sectionSettings: true })
		);

		expect(result).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});
});
