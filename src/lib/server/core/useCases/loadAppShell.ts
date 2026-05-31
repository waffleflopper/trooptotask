import type {
	AppShellDeferredChromePort,
	AppShellDeferredChromeResult,
	AppShellFirstPaintChromePort,
	AppShellRouteData,
	DeferredChromePart,
	OrgAccessPort
} from '../orgShell';
import { createReadyAppShell } from '../orgShell';

export type AppShellFirstPaintRequest =
	| {
			kind: 'ready';
			orgUrlSegment: string;
			access: OrgAccessPort;
			chrome: AppShellFirstPaintChromePort;
	  }
	| {
			kind: 'suspended';
			orgId: string;
			orgName: string;
			orgUrlSegment: string;
	  };

export async function loadAppShellFirstPaint(request: AppShellFirstPaintRequest): Promise<AppShellRouteData> {
	if (request.kind === 'suspended') {
		return {
			shell: {
				kind: 'suspended',
				org: {
					id: request.orgId,
					name: request.orgName,
					urlSegment: request.orgUrlSegment
				},
				state: {
					isReadOnly: true,
					orgSuspended: true
				}
			}
		};
	}

	const [membership, orgState, firstPaintChrome] = await Promise.all([
		request.access.getMembership(),
		request.access.getOrgState(),
		request.chrome.getFirstPaintChrome()
	]);

	return {
		shell: createReadyAppShell({
			orgUrlSegment: request.orgUrlSegment,
			membership,
			orgState,
			firstPaintChrome
		})
	};
}

export async function loadAppShellDeferredChrome(
	part: DeferredChromePart,
	port: AppShellDeferredChromePort
): Promise<AppShellDeferredChromeResult> {
	try {
		if (part === 'notification-count') {
			return {
				part,
				ok: true,
				unreadNotificationCount: await port.getUnreadNotificationCount()
			};
		}

		return {
			part,
			ok: true,
			organizations: await port.getOrganizationSwitcherOrgs()
		};
	} catch (cause) {
		console.error(`[app-shell] Failed to load deferred chrome part '${part}':`, cause);
		return {
			part,
			ok: false,
			reason: cause instanceof Error ? cause.message : 'Unknown error'
		};
	}
}
