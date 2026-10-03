import type {
	PlatformOrganizationLedgerInput,
	PlatformOrganizationLedgerQuery,
	PlatformOrganizationLedgerPageMetadata,
	PlatformOrganizationLedgerDependencies,
	PlatformOrganizationLedger
} from '../organizationSupportTypes';
import { displayOwnerMembership } from './metrics.server';

export const DEFAULT_PLATFORM_LEDGER_PAGE_SIZE = 25;
export const MAX_PLATFORM_LEDGER_PAGE_SIZE = 100;
const ORGANIZATION_STATUS_FILTERS = new Set(['active', 'suspended']);

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
