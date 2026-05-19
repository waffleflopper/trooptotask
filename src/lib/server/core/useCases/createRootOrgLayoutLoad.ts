import type { Cookies } from '@sveltejs/kit';
import { createOrgShellCoordinator, type OrgShellCoordinator, type RootOrgLoadPort } from '../orgShellCoordinator';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import {
	createSupabaseOrgAccessPort,
	createSupabaseOrgChromePort,
	createSupabaseRootOrgLoadPort,
	type SupabaseRootOrgLoadPortDeps
} from '$lib/server/adapters/supabaseOrgShell';

export interface RootOrgLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createRootPort?: (context: RootOrgLayoutRequestContext) => RootOrgLoadPort;
	getLayoutClient?: SupabaseRootOrgLoadPortDeps['getLayoutClient'];
	createSubscriptionAdapter?: typeof createSupabaseSubscriptionAdapter;
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createOrgChromePort?: typeof createSupabaseOrgChromePort;
}

interface RootOrgLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgSegment: string;
	url: URL;
}

export function createRootOrgLayoutLoad(deps: RootOrgLayoutLoadDeps = {}) {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createRootPort =
		deps.createRootPort ??
		(({ locals, cookies, orgSegment, url }: RootOrgLayoutRequestContext) =>
			createSupabaseRootOrgLoadPort(
				{ locals, cookies, orgSegment, url },
				{
					getLayoutClient: deps.getLayoutClient,
					createSubscriptionAdapter: deps.createSubscriptionAdapter,
					createOrgAccessPort: deps.createOrgAccessPort,
					createOrgChromePort: deps.createOrgChromePort
				}
			));

	return async ({
		params,
		locals,
		cookies,
		depends,
		url
	}: {
		params: { orgId: string };
		locals: App.Locals;
		cookies: import('@sveltejs/kit').Cookies;
		depends: (...deps: string[]) => void;
		url: URL;
	}) => {
		depends('app:org-core', 'app:org-preferences');
		return coordinator.loadRoot(createRootPort({ locals, cookies, orgSegment: params.orgId, url }));
	};
}
