import type { PlatformAudit, PlatformAuditOrganizationActivity } from '$lib/audit/contracts';
import type {
	OrganizationSupportMember,
	OrganizationSupportMemberReader,
	OrganizationSupportOrganization,
	OrganizationSupportPage,
	OrganizationSupportReader,
	OrganizationSupportOwnerMembership,
	OrganizationSupportOwnerMembershipMetric
} from '$features/organization/contracts';
import type { PersonnelSupportReader } from '$features/personnel/contracts';

export type PlatformSupportAdminRole = 'super_admin' | 'support' | 'billing';

export type PlatformOwnerMembershipRow = OrganizationSupportOwnerMembership;
export type PlatformOwnerMembershipMetric = OrganizationSupportOwnerMembershipMetric;

export type PlatformOwnerMembershipStatus =
	| { kind: 'single'; membership: PlatformOwnerMembershipRow }
	| { kind: 'none' }
	| { kind: 'multiple'; count: number };

export interface PlatformOrganizationMetrics {
	memberCounts: Map<string, number>;
	activePersonnelCounts: Map<string, number>;
	ownerMemberships: Map<string, PlatformOwnerMembershipStatus>;
}

export type PlatformMetricsStore = Pick<
	OrganizationSupportReader,
	'countMembershipsByOrganization' | 'listOwnerMembershipMetricsByOrganization'
> &
	PersonnelSupportReader;

export interface PlatformMetrics {
	countMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelForOrganization(organizationId: string): Promise<number>;
	getOwnerMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, PlatformOwnerMembershipStatus>>;
	getOrganizationMetrics(organizationIds: string[]): Promise<PlatformOrganizationMetrics>;
}

export interface PlatformMetricsDependencies {
	store: PlatformMetricsStore;
}

export interface PlatformOrganizationLedgerInput {
	page?: number | string | null;
	pageSize?: number | string | null;
	q?: string | null;
	status?: string | null;
}

export interface PlatformOrganizationLedgerQuery {
	page: number;
	pageSize: number;
	q: string;
	status: string;
	from: number;
	to: number;
}

export interface PlatformOrganizationLedgerPageMetadata {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	q: string;
	status: string;
}

export type PlatformOrganizationLedgerBaseRow = OrganizationSupportOrganization;
export type PlatformOrganizationLedgerPage = OrganizationSupportPage;
export type PlatformOrganizationLedgerStore = Pick<OrganizationSupportReader, 'listOrganizationsPage'>;

export interface PlatformOrganizationLedgerOrganizationRow extends PlatformOrganizationLedgerBaseRow {
	memberCount: number;
	personnelCount: number;
	ownerEmail: string;
	isSuspended: boolean;
}

export interface PlatformOrganizationLedgerListResult {
	organizations: PlatformOrganizationLedgerOrganizationRow[];
	pagination: PlatformOrganizationLedgerPageMetadata;
}

export interface PlatformOrganizationLedgerDependencies {
	store: PlatformOrganizationLedgerStore;
	metrics: Pick<PlatformMetrics, 'getOrganizationMetrics'>;
}

export interface PlatformOrganizationLedger {
	listOrganizations(input?: PlatformOrganizationLedgerInput): Promise<PlatformOrganizationLedgerListResult>;
}

export type PlatformOrganizationDetailOrganizationRow = OrganizationSupportOrganization;
export type PlatformOrganizationDetailStore = Pick<OrganizationSupportReader, 'getOrganizationById'>;

export interface PlatformOrganizationDetailMember {
	userId: string;
	email: string;
	role: OrganizationSupportMember['role'];
}

export interface PlatformOrganizationDetailOrg {
	id: string;
	name: string;
	suspendedAt: string | null;
	createdAt: string;
	isSuspended: boolean;
}

export interface PlatformOrganizationDetailLoadData {
	adminRole: PlatformSupportAdminRole;
	org: PlatformOrganizationDetailOrg;
	members: PlatformOrganizationDetailMember[];
	personnelCount: number;
	auditEvents: PlatformAuditOrganizationActivity[];
}

export type PlatformOrganizationDetailResult =
	| { status: 'found'; detail: PlatformOrganizationDetailLoadData }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformOrganizationDetail {
	getOrganizationDetail(orgId: string): Promise<PlatformOrganizationDetailResult>;
}

export interface PlatformOrganizationDetailDependencies {
	store: PlatformOrganizationDetailStore;
	adminRole: PlatformSupportAdminRole;
	membershipReader: OrganizationSupportMemberReader;
	metrics: Pick<PlatformMetrics, 'countActivePersonnelForOrganization'>;
	audit: Pick<PlatformAudit, 'listRecentByOrganization'>;
}
