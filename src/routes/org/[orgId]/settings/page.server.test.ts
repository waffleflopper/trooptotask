import { describe, expect, it } from 'vitest';
import { createReadyAppShellRouteData, createOrganizationLoadEventData } from '../appShell.test-support';
import { load } from './+page.server';

describe('settings index page server', () => {
	it.each([
		{ role: 'owner', landing: 'overview' },
		{ role: 'admin', landing: 'overview' },
		{ role: 'member', landing: 'general' }
	] as const)('redirects a $role to $landing', async ({ role, landing }) => {
		await expect(
			load({
				depends: () => undefined,
				cookies: {},
				...createOrganizationLoadEventData(
					createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'C Co', orgUrlSegment: 'c-co', role })
				)
			} as never)
		).rejects.toMatchObject({ status: 303, location: `/org/c-co/settings/${landing}` });
	});
});
