/**
 * In-memory implementations of the org shell port interfaces, for use in tests.
 *
 * Each factory is pre-configured with data at construction time — no async I/O, no framework
 * dependencies. Pass these into shell/workspace assembler functions instead of the Supabase-backed
 * adapters to keep tests fast and hermetic.
 *
 * Key exports:
 * - `createInMemoryOrgAccessPort(config)` — returns configured `MembershipInfo` and `OrgState`
 * - `createInMemoryOrgChromePort(config)` — returns configured `ChromeData`
 * - `createInMemoryOrgWorkspacePort(data)` — returns keyed workspace data
 * - `createInMemoryHydrationPlannerPort(plans)` — returns keyed `HydrationPlan` values
 */
import type {
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	HydrationPlannerPort,
	MembershipInfo,
	OrgState,
	ChromeData,
	HydrationPlan,
	WorkspaceKey
} from '$lib/server/core/orgShell';

export function createInMemoryOrgAccessPort(config: { membership: MembershipInfo; orgState: OrgState }): OrgAccessPort {
	return {
		getMembership: () => Promise.resolve(config.membership),
		getOrgState: () => Promise.resolve(config.orgState)
	};
}

export function createInMemoryOrgChromePort(config: { chrome: ChromeData }): OrgChromePort {
	return {
		getChromeData: () => Promise.resolve(config.chrome)
	};
}

export function createInMemoryOrgWorkspacePort(data: Map<WorkspaceKey, unknown>): OrgWorkspacePort {
	return {
		getWorkspaceData: <T>(workspace: WorkspaceKey) => {
			const value = data.get(workspace);
			if (value === undefined) {
				return Promise.reject(new Error(`No workspace data seeded for '${workspace}'`));
			}
			return Promise.resolve(value as T);
		}
	};
}

export function createInMemoryHydrationPlannerPort(plans: Map<WorkspaceKey, HydrationPlan>): HydrationPlannerPort {
	return {
		createPlan: (workspace: WorkspaceKey, _data: unknown) => plans.get(workspace)
	};
}
