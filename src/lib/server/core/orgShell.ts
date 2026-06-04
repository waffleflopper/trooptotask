/**
 * App shell/workspace type contracts and port interfaces for the org shell split (RFC #415).
 *
 * `AppShellRouteData` — first-paint identity, access, org state, preferences, and announcements.
 * `WorkspaceBootstrap<T>` — workspace-specific payload with an optional typed hydration plan.
 * Port interfaces (`OrgAccessPort`, `AppShellFirstPaintChromePort`, `AppShellDeferredChromePort`,
 * `OrgWorkspacePort`, `HydrationPlannerPort`)
 * define the internal composition boundary. SvelteKit adapter implementations live in
 * src/lib/server/adapters/; in-memory test implementations live in inMemoryOrgShell.ts.
 */
import type { EffectiveTier } from '$lib/types/subscription';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { UserOrgPreferences } from '$lib/preferences/userPreferences';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining } from '$features/training/training.types';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';

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
		effectiveTier: EffectiveTier;
		isReadOnly: boolean;
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
		isReadOnly: true;
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
			effectiveTier: orgState.effectiveTier,
			isReadOnly: orgState.effectiveTier.isReadOnly,
			orgSuspended: false
		},
		preferences: firstPaintChrome.preferences,
		announcements: firstPaintChrome.announcements
	};
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

export type WorkspaceKey = 'dashboard' | 'calendar' | 'personnel' | 'rating-scheme' | 'critical-tasks' | 'onboarding';

/**
 * Serializable description of how each client store should be hydrated.
 * The shell layer intentionally uses `unknown[]` slots — workspace assemblers own the
 * concrete types and cast when consuming the plan. The explicit `mode` and `snapshotKey`
 * fields give the coordinator hydration boundary a typed place to preserve optimistic
 * client state and skip unchanged server snapshots instead of relying on route-local
 * heuristics.
 */
export type HydrationMode = 'replace' | 'merge' | 'preserve-client';
export type HydrationItems<T = unknown> = T[] | Promise<T[]>;

export interface CriticalTasksBootstrap {
	settings: CriticalTasksSettings;
	personnelIctCompletions: HydrationItems<PersonnelIctCompletion>;
	ictTasks: HydrationItems<IctTask>;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
}

export interface CalendarAssignmentsHydrationItems {
	types: AssignmentType[];
	assignments: DailyAssignment[];
}

export interface HydrationTarget<T = unknown> {
	mode: HydrationMode;
	deferred?: boolean;
	/**
	 * Stable identity for the server snapshot backing this target.
	 * The coordinator hydration boundary uses this to avoid re-loading unchanged data.
	 */
	snapshotKey: string;
	items: HydrationItems<T>;
}

export interface CalendarAssignmentsHydrationTarget {
	mode: HydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	rangeStart?: string;
	rangeEnd?: string;
	items: CalendarAssignmentsHydrationItems | Promise<CalendarAssignmentsHydrationItems>;
}

export interface OnboardingTemplatesHydrationTarget {
	mode: HydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	templates: OnboardingTemplate[];
	steps: OnboardingTemplateStep[];
}

export interface HydrationPlan {
	orgId: string;
	personnel?: {
		scoped: HydrationTarget;
		/** Only present when explicit all-org data was available. Absent for scoped members. */
		all?: HydrationTarget;
	};
	groups?: HydrationTarget;
	statusTypes?: HydrationTarget;
	availabilityEntries?: HydrationTarget<AvailabilityEntry>;
	specialDays?: HydrationTarget<SpecialDay>;
	calendarAssignments?: CalendarAssignmentsHydrationTarget;
	trainingTypes?: HydrationTarget;
	trainingViews?: HydrationTarget;
	personnelTrainings?: HydrationTarget<PersonnelTraining>;
	ictTasks?: HydrationTarget<IctTask>;
	personnelIctCompletions?: HydrationTarget<PersonnelIctCompletion>;
	pinnedGroups?: HydrationTarget<string>;
	ratingSchemeEntries?: HydrationTarget<RatingSchemeEntry>;
	onboardingTemplates?: OnboardingTemplatesHydrationTarget;
	onboardings?: HydrationTarget<PersonnelOnboarding>;
}

export interface WorkspaceBootstrap<T> {
	workspace: WorkspaceKey;
	data: T;
	hydration?: HydrationPlan;
}

export interface DeferredData<T> {
	data: Promise<T>;
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
	effectiveTier: EffectiveTier;
}

// ---------------------------------------------------------------------------
// Port interfaces — framework-agnostic, pre-configured per request
// ---------------------------------------------------------------------------

export interface OrgAccessPort {
	getMembership(): Promise<MembershipInfo>;
	getOrgState(): Promise<OrgState>;
}

export interface OrgWorkspacePort {
	getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T>;
}

export interface StreamableOrgWorkspacePort extends OrgWorkspacePort {
	streamWorkspaceData<T>(workspace: WorkspaceKey): Promise<DeferredData<T>>;
}

export interface HydrationPlannerPort {
	createPlan(workspace: WorkspaceKey, data: unknown): HydrationPlan | undefined;
}
