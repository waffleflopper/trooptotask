/**
 * In-memory implementations of the App Shell port interfaces, for use in tests.
 *
 * Each factory is pre-configured with data at construction time — no async I/O, no framework
 * dependencies. Pass these into shell assembler functions instead of the Supabase-backed
 * adapters to keep tests fast and hermetic.
 *
 * Key exports:
 * - `createInMemoryOrgAccessPort(config)` — returns configured `MembershipInfo` and `OrgState`
 * - `createInMemoryAppShellFirstPaintChromePort(config)` — returns configured first-paint chrome
 * - `createInMemoryAppShellDeferredChromePort(config)` — returns configured deferred chrome
 */
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	OrgAccessPort,
	MembershipInfo,
	OrgState,
	OrganizationSwitcherOrg
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
