import type { PlatformAuditOrganizationActivity } from '$lib/audit/contracts';
import type { MembershipRole } from '$lib/access/memberAccessShape';

export const PLATFORM_ORGANIZATION_FILTERS = ['all', 'active-week', 'quiet', 'suspended'] as const;
export type PlatformOrganizationFilter = (typeof PLATFORM_ORGANIZATION_FILTERS)[number];

/** Quiet is no audit event for 30 days; the database owns the rule so the list and the page agree. */
export type PlatformOrganizationStatus = 'active' | 'quiet' | 'suspended';

export const PLATFORM_ORGANIZATION_STATUS_LABELS: Record<PlatformOrganizationStatus, string> = {
	active: 'Active',
	quiet: 'Quiet',
	suspended: 'Suspended'
};

export const PLATFORM_ORGANIZATION_SORT_KEYS = [
	'name',
	'owner',
	'members',
	'personnel',
	'lastActive',
	'created',
	'status'
] as const;
export type PlatformOrganizationSortKey = (typeof PLATFORM_ORGANIZATION_SORT_KEYS)[number];
export interface PlatformOrganizationSort {
	key: PlatformOrganizationSortKey;
	direction: 'asc' | 'desc';
}

export const PLATFORM_ORGANIZATIONS_PAGE_SIZE = 25;
/** Load more stops here, so one request never reads more than this many pages of rows. */
export const PLATFORM_ORGANIZATIONS_MAX_PAGES = 20;

export interface PlatformOrganizationListInput {
	pages?: number | string | null;
	q?: string | null;
	filter?: string | null;
	sort?: string | null;
	dir?: string | null;
}

export interface PlatformOrganizationListQuery {
	/** How many pages of rows are shown. Load more asks for one more, so the list always starts at the top. */
	pages: number;
	q: string;
	filter: PlatformOrganizationFilter;
	sort: PlatformOrganizationSort;
}

export interface PlatformOrganizationRow {
	id: string;
	name: string;
	createdAt: string;
	status: PlatformOrganizationStatus;
	lastActiveAt: string | null;
	memberCount: number;
	personnelCount: number;
	ownerCount: number;
	ownerEmail: string | null;
}

/** How many Organizations each filter would list under the current search. */
export interface PlatformOrganizationFilterCounts {
	all: number;
	activeWeek: number;
	quiet: number;
	suspended: number;
}

export interface PlatformOrganizationPage {
	counts: PlatformOrganizationFilterCounts;
	organizations: PlatformOrganizationRow[];
	totalCount: number;
}

export interface PlatformOrganizationMember {
	userId: string;
	email: string | null;
	role: MembershipRole;
	lastSignInAt: string | null;
}

export interface PlatformOrganizationInvitation {
	id: string;
	email: string;
	role: string;
	invitedAt: string;
	expiresAt: string | null;
}

export interface PlatformOrganizationSuspension {
	reason: string;
	suspendedAt: string;
	suspendedByEmail: string | null;
}

export interface PlatformOrganizationDetail {
	id: string;
	name: string;
	createdAt: string;
	status: PlatformOrganizationStatus;
	lastActiveAt: string | null;
	personnelCount: number;
	suspendedAt: string | null;
	/** Absent for an Organization suspended before reasons were recorded. */
	suspension: PlatformOrganizationSuspension | null;
	members: PlatformOrganizationMember[];
	invitations: PlatformOrganizationInvitation[];
}

export interface PlatformOrganizationDirectory {
	listOrganizations(query: PlatformOrganizationListQuery): Promise<PlatformOrganizationPage>;
	getOrganization(organizationId: string): Promise<PlatformOrganizationDetail | null>;
}

export type PlatformOrganizationActivityEvent = PlatformAuditOrganizationActivity;
