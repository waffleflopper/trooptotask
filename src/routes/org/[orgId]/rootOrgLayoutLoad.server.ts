import type { Cookies } from '@sveltejs/kit';
import { createAppShellRequest, type AppShellRequestDeps } from '$lib/server/adapters/appShellRequestDelivery';
import type { AppShellRequest } from '$features/app-shell/contracts';
import { streamOrganizationSetupEntry } from './setupEntryLoad.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
export interface RootOrgLayoutLoadDeps {
	createAppShellRequest?: (context: RootOrgLayoutRequestContext) => AppShellRequest;
	getAdmittedRequestClient?: AppShellRequestDeps['getAdmittedRequestClient'];
	createOrgAccessPort?: AppShellRequestDeps['createOrgAccessPort'];
	createFirstPaintChromePort?: AppShellRequestDeps['createFirstPaintChromePort'];
	createDeferredChromePort?: AppShellRequestDeps['createDeferredChromePort'];
	streamSetupEntry?: typeof streamOrganizationSetupEntry;
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
		const data = await bindAppShellRequest({ locals, cookies, orgSegment: params.orgId, url }).loadFirstPaint();
		if (data.shell.kind !== 'ready' || !data.shell.member.isOwner) return { ...data, organizationSetup: null };
		depends('app:organization-setup', VIEWER_DAY_DEPENDENCY);
		return {
			...data,
			organizationSetup: (deps.streamSetupEntry ?? streamOrganizationSetupEntry)({
				locals,
				cookies,
				orgId: data.shell.org.id
			})
		};
	};
}
