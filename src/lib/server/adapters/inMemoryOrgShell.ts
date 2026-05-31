/**
 * In-memory implementations of the org shell port interfaces, for use in tests.
 *
 * Each factory is pre-configured with data at construction time — no async I/O, no framework
 * dependencies. Pass these into shell/workspace assembler functions instead of the Supabase-backed
 * adapters to keep tests fast and hermetic.
 *
 * Key exports:
 * - `createInMemoryOrgAccessPort(config)` — returns configured `MembershipInfo` and `OrgState`
 * - `createInMemoryAppShellFirstPaintChromePort(config)` — returns configured first-paint chrome
 * - `createInMemoryAppShellDeferredChromePort(config)` — returns configured deferred chrome
 * - `createInMemoryOrgWorkspacePort(data)` — returns keyed workspace data
 * - `createInMemoryHydrationPlannerPort(plans)` — returns keyed `HydrationPlan` values
 */
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	OrgAccessPort,
	StreamableOrgWorkspacePort,
	HydrationPlannerPort,
	MembershipInfo,
	OrgState,
	HydrationPlan,
	OrganizationSwitcherOrg,
	WorkspaceKey
} from '$lib/server/core/orgShell';

export function createInMemoryOrgAccessPort(config: { membership: MembershipInfo; orgState: OrgState }): OrgAccessPort {
	return {
		getMembership: () => Promise.resolve(config.membership),
		getOrgState: () => Promise.resolve(config.orgState)
	};
}

export function createInMemoryAppShellFirstPaintChromePort(config: {
	chrome: AppShellFirstPaintChrome;
}): AppShellFirstPaintChromePort {
	return {
		getFirstPaintChrome: () => Promise.resolve(config.chrome)
	};
}

export function createInMemoryAppShellDeferredChromePort(config: {
	unreadNotificationCount: number;
	organizations: OrganizationSwitcherOrg[];
}): AppShellDeferredChromePort {
	return {
		getUnreadNotificationCount: () => Promise.resolve(config.unreadNotificationCount),
		getOrganizationSwitcherOrgs: () => Promise.resolve(config.organizations)
	};
}

export function createInMemoryOrgWorkspacePort(data: Map<WorkspaceKey, unknown>): StreamableOrgWorkspacePort {
	return {
		getWorkspaceData: <T>(workspace: WorkspaceKey) => {
			const value = data.get(workspace);
			if (value === undefined) {
				return Promise.reject(new Error(`No workspace data seeded for '${workspace}'`));
			}
			return Promise.resolve(value as T);
		},
		streamWorkspaceData: <T>(workspace: WorkspaceKey) => {
			const value = data.get(workspace);
			if (value === undefined) {
				return Promise.reject(new Error(`No workspace data seeded for '${workspace}'`));
			}
			return Promise.resolve({ data: Promise.resolve(value as T) });
		}
	};
}

export function createInMemoryHydrationPlannerPort(plans: Map<WorkspaceKey, HydrationPlan>): HydrationPlannerPort {
	return {
		createPlan: (workspace: WorkspaceKey, _data: unknown) => plans.get(workspace)
	};
}
