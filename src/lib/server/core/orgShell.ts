/**
 * Shell/workspace type contracts and port interfaces for the org shell split (RFC #415).
 *
 * `OrgShellData` — identity, access, org state, and chrome only. No feature reference data.
 * `WorkspaceBootstrap<T>` — workspace-specific payload with an optional typed hydration plan.
 * Port interfaces (`OrgAccessPort`, `OrgChromePort`, `OrgWorkspacePort`, `HydrationPlannerPort`)
 * define the internal composition boundary. SvelteKit adapter implementations live in
 * src/lib/server/adapters/; in-memory test implementations live in inMemoryOrgShell.ts.
 */
import type { OrganizationMemberPermissions } from '$lib/types';
import type { EffectiveTier } from '$lib/types/subscription';

// ---------------------------------------------------------------------------
// Announcement — defined here as a domain type (not tied to the DB query)
// ---------------------------------------------------------------------------

export interface Announcement {
	id: string;
	title: string;
	message: string;
	type: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Shell data — identity, access, org state, chrome only
// ---------------------------------------------------------------------------

export interface OrgShellData {
	orgId: string;
	orgName: string;
	userId: string | null;
	userRole: 'owner' | 'admin' | 'member';
	permissions: OrganizationMemberPermissions;
	scopedGroupId: string | null;
	isOwner: boolean;
	isAdmin: boolean;
	isFullEditor: boolean;
	effectiveTier: EffectiveTier;
	unreadNotificationCount: number;
	activeAnnouncements: Announcement[];
	allOrgs: Array<{ id: string; name: string; role: string }>;
	isDemoReadOnly: boolean;
	isDemoSandbox: boolean;
	orgSuspended?: boolean;
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

export type WorkspaceKey = 'dashboard' | 'calendar' | 'personnel' | 'training' | 'onboarding';

/**
 * Serializable description of which stores a workspace needs hydrated on the client.
 * The shell layer intentionally uses `unknown[]` slots — workspace assemblers own the
 * concrete types and cast when consuming the plan. This keeps the shell module free of
 * feature-domain imports.
 */
export interface HydrationPlan {
	personnel?: { scoped: unknown[]; all: unknown[] };
	groups?: unknown[];
	statusTypes?: unknown[];
	trainingTypes?: unknown[];
}

export interface WorkspaceBootstrap<T> {
	workspace: WorkspaceKey;
	data: T;
	hydration?: HydrationPlan;
}

// ---------------------------------------------------------------------------
// Port input/output types
// ---------------------------------------------------------------------------

export interface MembershipInfo {
	orgId: string;
	userId: string | null;
	role: 'owner' | 'admin' | 'member';
	permissions: OrganizationMemberPermissions;
	scopedGroupId: string | null;
	orgSuspended?: boolean;
}

export interface OrgState {
	orgName: string;
	isDemoReadOnly: boolean;
	isDemoSandbox: boolean;
	effectiveTier: EffectiveTier;
}

export interface ChromeData {
	unreadNotificationCount: number;
	activeAnnouncements: Announcement[];
	allOrgs: Array<{ id: string; name: string; role: string }>;
}

// ---------------------------------------------------------------------------
// Port interfaces — framework-agnostic, pre-configured per request
// ---------------------------------------------------------------------------

export interface OrgAccessPort {
	getMembership(): Promise<MembershipInfo>;
	getOrgState(): Promise<OrgState>;
}

export interface OrgChromePort {
	getChromeData(): Promise<ChromeData>;
}

export interface OrgWorkspacePort {
	getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T>;
}

export interface HydrationPlannerPort {
	createPlan(workspace: WorkspaceKey, data: unknown): HydrationPlan | undefined;
}
