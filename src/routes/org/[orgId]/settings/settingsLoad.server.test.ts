import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createReadyAppShellRouteData,
	createSuspendedAppShellRouteData,
	createOrganizationLoadEventData
} from '../appShell.test-support';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', () => ({ loadWithContext: loadWithContextMock }));
import { buildCommonSettingsPageData, buildSettingsPageOrganization, loadSettingsPage } from './settingsLoad.server';

const identity = {
	id: 'org-1',
	name: 'Test Org',
	urlSlug: 'test-org',
	suspendedAt: null,
	createdAt: null,
	disabledFeatures: []
};

describe('settings load helpers', () => {
	beforeEach(() => loadWithContextMock.mockReset());
	it('keeps the Organization name, segment and admin flag from the admitted facts', () => {
		expect(buildCommonSettingsPageData(identity, { role: 'admin' })).toEqual({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgUrlSlug: 'test-org',
			orgName: 'Test Org',
			isAdmin: true
		});
		expect(buildSettingsPageOrganization(identity)).toEqual({
			id: 'org-1',
			name: 'Test Org',
			urlSlug: 'test-org',
			urlSegment: 'test-org'
		});
		expect(buildCommonSettingsPageData({ ...identity, name: null, urlSlug: null }, { role: 'owner' })).toEqual({
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			orgUrlSlug: null,
			orgName: 'Organization',
			isAdmin: false
		});
	});
	it('loads a section and common props without running ancestors', async () => {
		const ctx = { auth: { orgId: 'org-1', role: 'owner' as const } };
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			config.fn(config.context({}))
		);
		const depends = vi.fn();
		const result = await loadSettingsPage(
			{
				depends,
				...createOrganizationLoadEventData(
					createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Org', orgUrlSegment: 'org-1', role: 'owner' })
				),
				cookies: {} as import('@sveltejs/kit').Cookies
			},
			() => ctx,
			(received, { common, organization }) => ({
				sectionSettings: {
					authOrgId: received.auth.orgId,
					commonOrgId: common.orgId,
					organizationUrlSegment: organization.urlSegment
				}
			})
		);
		expect(depends).toHaveBeenCalledWith('app:org-core');
		expect(result).toEqual({
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			orgUrlSlug: null,
			orgName: 'Test Org',
			isAdmin: false,
			sectionSettings: { authOrgId: 'org-1', commonOrgId: 'org-1', organizationUrlSegment: 'org-1' }
		});
	});
	it('returns no section data for a suspended Organization', async () => {
		const result = await loadSettingsPage(
			{
				depends: () => undefined,
				...createOrganizationLoadEventData(createSuspendedAppShellRouteData()),
				cookies: {} as import('@sveltejs/kit').Cookies
			},
			() => ({ auth: { role: 'owner' as const } }),
			() => ({ sectionSettings: true })
		);
		expect(result).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});
});
