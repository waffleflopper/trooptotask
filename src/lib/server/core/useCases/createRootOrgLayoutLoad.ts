import type { Cookies } from '@sveltejs/kit';
import {
	createSupabaseAppShellDeferredChromePort,
	createSupabaseAppShellFirstPaintChromePort,
	createSupabaseAppShellRequest,
	createSupabaseOrgAccessPort,
	type SupabaseAppShellRequestDeps
} from '$lib/server/adapters/supabaseOrgShell';
import type { AppShellRequest } from '../orgShell';

export interface RootOrgLayoutLoadDeps {
	createAppShellRequest?: (context: RootOrgLayoutRequestContext) => AppShellRequest;
	getLayoutClient?: SupabaseAppShellRequestDeps['getLayoutClient'];
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createFirstPaintChromePort?: typeof createSupabaseAppShellFirstPaintChromePort;
	createDeferredChromePort?: typeof createSupabaseAppShellDeferredChromePort;
}

interface RootOrgLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgSegment: string;
	url: URL;
}

export function createRootOrgLayoutLoad(deps: RootOrgLayoutLoadDeps = {}) {
	const createAppShellRequest =
		deps.createAppShellRequest ??
		(({ locals, cookies, orgSegment, url }: RootOrgLayoutRequestContext) =>
			createSupabaseAppShellRequest(
				{ locals, cookies, orgSegment, url },
				{
					getLayoutClient: deps.getLayoutClient,
					createOrgAccessPort: deps.createOrgAccessPort,
					createFirstPaintChromePort: deps.createFirstPaintChromePort,
					createDeferredChromePort: deps.createDeferredChromePort
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
		return createAppShellRequest({ locals, cookies, orgSegment: params.orgId, url }).loadFirstPaint();
	};
}
