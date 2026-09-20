import type { PlatformMetrics } from './platformMetrics';
import { displayOwnerMembership } from './platformMetrics';

export const DEFAULT_PLATFORM_LEDGER_PAGE_SIZE = 25;
export const MAX_PLATFORM_LEDGER_PAGE_SIZE = 100;
const ORGANIZATION_STATUS_FILTERS = new Set(['active', 'suspended']);

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

export interface PlatformOrganizationLedgerBaseRow {
	id: string;
	name: string;
	suspended_at: string | null;
	created_at: string;
}

export interface PlatformOrganizationLedgerPage {
	organizations: PlatformOrganizationLedgerBaseRow[];
	totalCount: number;
}

export interface PlatformOrganizationLedgerStore {
	listOrganizationsPage(query: PlatformOrganizationLedgerQuery): Promise<PlatformOrganizationLedgerPage>;
}

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
	metrics: PlatformMetrics;
}

export interface PlatformOrganizationLedger {
	listOrganizations(input?: PlatformOrganizationLedgerInput): Promise<PlatformOrganizationLedgerListResult>;
}

function readPositiveInteger(value: number | string | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return null;
	return parsed;
}

function normalizeFilter(value: string | null | undefined, allowedValues: ReadonlySet<string>): string {
	const normalized = (value ?? '').trim().toLowerCase();
	return allowedValues.has(normalized) ? normalized : 'all';
}

export function normalizePlatformOrganizationLedgerQuery(
	input: PlatformOrganizationLedgerInput = {}
): PlatformOrganizationLedgerQuery {
	const page = readPositiveInteger(input.page) ?? 1;
	const requestedPageSize = readPositiveInteger(input.pageSize) ?? DEFAULT_PLATFORM_LEDGER_PAGE_SIZE;
	const pageSize = Math.min(requestedPageSize, MAX_PLATFORM_LEDGER_PAGE_SIZE);
	const q = (input.q ?? '').trim();
	const status = normalizeFilter(input.status, ORGANIZATION_STATUS_FILTERS);
	const from = (page - 1) * pageSize;

	return {
		page,
		pageSize,
		q,
		status,
		from,
		to: from + pageSize - 1
	};
}

function buildPagination(
	query: PlatformOrganizationLedgerQuery,
	totalCount: number
): PlatformOrganizationLedgerPageMetadata {
	return {
		page: query.page,
		pageSize: query.pageSize,
		totalCount,
		totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
		q: query.q,
		status: query.status
	};
}

export function createPlatformOrganizationLedger(
	deps: PlatformOrganizationLedgerDependencies
): PlatformOrganizationLedger {
	return {
		async listOrganizations(input = {}) {
			const query = normalizePlatformOrganizationLedgerQuery(input);
			const { organizations: rows, totalCount } = await deps.store.listOrganizationsPage(query);
			const orgIds = rows.map((org) => org.id);
			const metrics = await deps.metrics.getOrganizationMetrics(orgIds);

			return {
				organizations: rows.map((org) => {
					const ownerEmail = displayOwnerMembership(metrics.ownerMemberships.get(org.id));

					return {
						...org,
						memberCount: metrics.memberCounts.get(org.id) ?? 0,
						personnelCount: metrics.activePersonnelCounts.get(org.id) ?? 0,
						ownerEmail,
						isSuspended: !!org.suspended_at
					};
				}),
				pagination: buildPagination(query, totalCount)
			};
		}
	};
}
