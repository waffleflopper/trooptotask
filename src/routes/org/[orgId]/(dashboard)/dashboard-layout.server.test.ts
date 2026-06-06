import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { DashboardWorkspaceRouteData } from '$features/dashboard/server/dashboardWorkspaceBootstrap';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { _createDashboardLayoutLoad } from './+layout.server';

describe('dashboard layout server load', () => {
	it('registers dashboard dependencies and streams Dashboard with canonical shell organization identity', async () => {
		const depends = vi.fn();
		const dashboard = { data: Promise.resolve({ workspaceKey: 'dashboard' } as never) };
		const streamDashboardWorkspace = vi.fn().mockResolvedValue({
			dashboard
		} satisfies DashboardWorkspaceRouteData);
		const load = _createDashboardLayoutLoad({
			streamDashboardWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'canonical-org-id' }));

		const result = await load({
			params: { orgId: 'stale-route-param' },
			locals,
			cookies,
			depends,
			url: new URL('https://example.test/org/stale-route-param'),
			parent
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:dashboard-data');
		expect(parent).toHaveBeenCalledTimes(1);
		expect(streamDashboardWorkspace).toHaveBeenCalledWith({
			locals,
			cookies,
			orgId: 'canonical-org-id'
		});
		expect(result).toEqual({ dashboard });
	});
});
