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
	orgId: string;
}

export function createRootOrgLayoutLoad(deps: RootOrgLayoutLoadDeps = {}) {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createRootPort =
		deps.createRootPort ??
		(({ locals, cookies, orgId }: RootOrgLayoutRequestContext) =>
			createSupabaseRootOrgLoadPort(
				{ locals, cookies, orgId },
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
		depends
	}: {
		params: { orgId: string };
		locals: App.Locals;
		cookies: import('@sveltejs/kit').Cookies;
		depends: (...deps: string[]) => void;
	}) => {
		depends('app:org-core', 'app:org-preferences');
		return coordinator.loadRoot(createRootPort({ locals, cookies, orgId: params.orgId }));
	};
}
