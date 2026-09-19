/**
 * App shell type contracts and port interfaces for the org shell split (RFC #415).
 *
 * `AppShellRouteData` — first-paint identity, access, org state, preferences, and announcements.
 * Port interfaces (`OrgAccessPort`, `AppShellFirstPaintChromePort`, `AppShellDeferredChromePort`)
 * define the internal composition boundary. SvelteKit adapter implementations live in
 * src/lib/server/adapters/; in-memory test implementations live in inMemoryOrgShell.ts.
 */
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { UserOrgPreferences } from '$lib/preferences/userPreferences';

// ---------------------------------------------------------------------------
// Announcement — defined here as a domain type (not tied to the DB query)
// ---------------------------------------------------------------------------

export interface Announcement {
	id: string;
	title: string;
	message: string;
	type: 'info' | 'warning' | 'maintenance';
}

// ---------------------------------------------------------------------------
// App shell data — first paint and deferred chrome
// ---------------------------------------------------------------------------

export interface OrganizationSwitcherOrg {
	id: string;
	name: string;
	role: string;
	urlSegment?: string;
}

export interface ReadyAppShell {
	kind: 'ready';
	org: {
		id: string;
		urlSegment: string;
		name: string;
	};
	user: {
		id: string;
	};
	member: {
		membershipId: string | null;
		role: 'owner' | 'admin' | 'member';
		capabilityMap: CapabilityMap;
		scopeSet: ScopeSet;
		isOwner: boolean;
		isAdmin: boolean;
	};
	state: {
		orgSuspended: false;
	};
	preferences: UserOrgPreferences;
	announcements: Announcement[];
}

export interface SuspendedAppShell {
	kind: 'suspended';
	org: {
		id: string;
		urlSegment: string;
		name: string;
	};
	state: {
		orgSuspended: true;
	};
}

export interface AppShellRouteData {
	shell: ReadyAppShell | SuspendedAppShell;
}

export interface AppShellFirstPaintChrome {
	announcements: Announcement[];
	preferences: UserOrgPreferences;
}

export type DeferredChromePart = 'notification-count' | 'organization-switcher';

export type AppShellDeferredChromeResult =
	| {
			part: 'notification-count';
			ok: true;
			unreadNotificationCount: number;
	  }
	| {
			part: 'organization-switcher';
			ok: true;
			organizations: OrganizationSwitcherOrg[];
	  }
	| {
			part: DeferredChromePart;
			ok: false;
			reason: string;
	  };

export interface AppShellRequest {
	loadFirstPaint(): Promise<AppShellRouteData>;
	loadDeferredChrome(part: DeferredChromePart): Promise<AppShellDeferredChromeResult>;
}

export interface AppShellFirstPaintChromePort {
	getFirstPaintChrome(): Promise<AppShellFirstPaintChrome>;
}

export interface AppShellDeferredChromePort {
	getUnreadNotificationCount(): Promise<number>;
	getOrganizationSwitcherOrgs(): Promise<OrganizationSwitcherOrg[]>;
}

export function createReadyAppShell(config: {
	orgUrlSegment: string;
	membership: MembershipInfo;
	orgState: OrgState;
	firstPaintChrome: AppShellFirstPaintChrome;
}): ReadyAppShell {
	const { membership, orgState, firstPaintChrome } = config;
	const isOwner = membership.role === 'owner';
	const isAdmin = membership.role === 'admin';

	return {
		kind: 'ready',
		org: {
			id: membership.orgId,
			urlSegment: config.orgUrlSegment,
			name: orgState.orgName
		},
		user: {
			id: membership.userId
		},
		member: {
			membershipId: membership.membershipId,
			role: membership.role,
			capabilityMap: membership.capabilityMap,
			scopeSet: membership.scopeSet,
			isOwner,
			isAdmin
		},
		state: {
			orgSuspended: false
		},
		preferences: firstPaintChrome.preferences,
		announcements: firstPaintChrome.announcements
	};
}

// ---------------------------------------------------------------------------
// Port input/output types
// ---------------------------------------------------------------------------

export interface MembershipInfo {
	orgId: string;
	membershipId: string | null;
	userId: string;
	role: 'owner' | 'admin' | 'member';
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
	orgSuspended?: boolean;
}

export interface OrgState {
	orgName: string;
}

// ---------------------------------------------------------------------------
// Port interfaces — framework-agnostic, pre-configured per request
// ---------------------------------------------------------------------------

export interface OrgAccessPort {
	getMembership(): Promise<MembershipInfo>;
	getOrgState(): Promise<OrgState>;
}
