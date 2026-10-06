import type { Cookies } from '@sveltejs/kit';
import { createAppShellRequest, type AppShellRequestDeps } from '$lib/server/adapters/appShellRequestDelivery';
import type { AppShellRequest } from '$features/app-shell/contracts';
export interface RootOrgLayoutLoadDeps {
	createAppShellRequest?: (context: RootOrgLayoutRequestContext) => AppShellRequest;
	getAdmittedRequestClient?: AppShellRequestDeps['getAdmittedRequestClient'];
	createOrgAccessPort?: AppShellRequestDeps['createOrgAccessPort'];
	createFirstPaintChromePort?: AppShellRequestDeps['createFirstPaintChromePort'];
	createDeferredChromePort?: AppShellRequestDeps['createDeferredChromePort'];
}

interface RootOrgLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgSegment: string;
	url: URL;
}

export function createRootOrgLayoutLoad(deps: RootOrgLayoutLoadDeps = {}) {
	const bindAppShellRequest =
		deps.createAppShellRequest ??
		(({ locals, cookies, orgSegment, url }: RootOrgLayoutRequestContext) =>
			createAppShellRequest(
				{ locals, cookies, orgSegment, url },
				{
					getAdmittedRequestClient: deps.getAdmittedRequestClient,
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
		depends('app:org-core');
		return bindAppShellRequest({ locals, cookies, orgSegment: params.orgId, url }).loadFirstPaint();
	};
}
