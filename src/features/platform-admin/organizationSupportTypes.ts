import type { PlatformAudit, PlatformAuditOrganizationActivity } from '$lib/audit/contracts';
import type {
	OrganizationSupportMember,
	OrganizationSupportMemberReader,
	OrganizationSupportOrganization,
	OrganizationSupportReader
} from '$features/organization/contracts';
import type { PersonnelSupportReader } from '$features/personnel/contracts';

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
export type PlatformOrganizationLedgerStore = Pick<
	OrganizationSupportReader,
	'listOrganizationsPage' | 'countMembershipsByOrganization' | 'listOwnerMembershipMetricsByOrganization'
>;

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
	personnel: Pick<PersonnelSupportReader, 'countActivePersonnelByOrganization'>;
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
	membershipReader: OrganizationSupportMemberReader;
	personnel: Pick<PersonnelSupportReader, 'countActivePersonnelForOrganization'>;
	audit: Pick<PlatformAudit, 'listRecentByOrganization'>;
}
