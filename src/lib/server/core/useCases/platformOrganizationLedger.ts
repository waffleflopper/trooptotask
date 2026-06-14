import { visibleBillingSnapshotForAdminRole } from '$lib/server/adminBillingVisibility';
import type { AdminRole } from '$lib/server/admin';
import type { PlanAdminDiagnostics } from './planAdminDiagnostics';
import type { PlatformMetrics } from './platformMetrics';
import { displayOwnerMembership } from './platformMetrics';
import { summarizeBillingCancellation } from './billingState';
import { TIER_CONFIG, type BillingCancellationSummary, type BillingSnapshot, type Tier } from '$lib/types/subscription';

export const DEFAULT_PLATFORM_LEDGER_PAGE_SIZE = 25;
export const MAX_PLATFORM_LEDGER_PAGE_SIZE = 100;
const PLAN_DIAGNOSTICS_CONCURRENCY = 8;
const TIER_FILTERS = new Set(['free', 'team', 'unit']);
const ORGANIZATION_STATUS_FILTERS = new Set(['active', 'suspended']);
const SUBSCRIPTION_STATUS_FILTERS = new Set(['active', 'suspended', 'gifted', 'canceling', 'canceled', 'drifted']);

export interface PlatformOrganizationLedgerInput {
	page?: number | string | null;
	pageSize?: number | string | null;
	q?: string | null;
	tier?: string | null;
	status?: string | null;
}

export interface PlatformOrganizationLedgerQuery {
	page: number;
	pageSize: number;
	q: string;
	tier: string;
	status: string;
	statusScope: 'organizations' | 'subscriptions';
	from: number;
	to: number;
}

export interface PlatformOrganizationLedgerPageMetadata {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	q: string;
	tier: string;
	status: string;
}

export interface PlatformOrganizationLedgerBaseRow {
	id: string;
	name: string;
	tier: string | null;
	gift_tier: string | null;
	gift_expires_at: string | null;
	suspended_at: string | null;
	created_at: string;
}

export interface PlatformOrganizationLedgerPage {
	organizations: PlatformOrganizationLedgerBaseRow[];
	totalCount: number;
}

export interface PlatformOrganizationLedgerStore {
	listOrganizationsPage(query: PlatformOrganizationLedgerQuery): Promise<PlatformOrganizationLedgerPage>;
	listBillingSnapshotsByOrganization(organizationIds: string[]): Promise<Map<string, BillingSnapshot>>;
}

export interface PlatformOrganizationLedgerOrganizationRow extends PlatformOrganizationLedgerBaseRow {
	effectiveTier: string;
	memberCount: number;
	personnelCount: number;
	ownerEmail: string;
	isSuspended: boolean;
}

export interface PlatformSubscriptionLedgerRow extends PlatformOrganizationLedgerBaseRow {
	effectiveTier: string;
	personnelCount: number;
	personnelCap: number | null;
	ownerEmail: string;
	isGifted: boolean;
	isSuspended: boolean;
	billingSnapshot: BillingSnapshot | null;
	planDiagnostics: PlanAdminDiagnostics | null;
	cancellationSummary: BillingCancellationSummary | null;
}

export interface PlatformOrganizationLedgerListResult {
	organizations: PlatformOrganizationLedgerOrganizationRow[];
	pagination: PlatformOrganizationLedgerPageMetadata;
}

export interface PlatformSubscriptionLedgerListResult {
	subscriptions: PlatformSubscriptionLedgerRow[];
	pagination: PlatformOrganizationLedgerPageMetadata;
	billingDiagnosticsError: boolean;
	planDiagnosticsError: boolean;
}

export interface PlatformOrganizationLedgerDependencies {
	store: PlatformOrganizationLedgerStore;
	metrics: PlatformMetrics;
	adminRole: AdminRole;
	readPlanDiagnostics?: (organizationId: string) => Promise<PlanAdminDiagnostics>;
}

export interface PlatformOrganizationLedger {
	listOrganizations(input?: PlatformOrganizationLedgerInput): Promise<PlatformOrganizationLedgerListResult>;
	listSubscriptions(input?: PlatformOrganizationLedgerInput): Promise<PlatformSubscriptionLedgerListResult>;
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
	input: PlatformOrganizationLedgerInput = {},
	statusFilters: ReadonlySet<string> = ORGANIZATION_STATUS_FILTERS,
	statusScope: PlatformOrganizationLedgerQuery['statusScope'] = 'organizations'
): PlatformOrganizationLedgerQuery {
	const page = readPositiveInteger(input.page) ?? 1;
	const requestedPageSize = readPositiveInteger(input.pageSize) ?? DEFAULT_PLATFORM_LEDGER_PAGE_SIZE;
	const pageSize = Math.min(requestedPageSize, MAX_PLATFORM_LEDGER_PAGE_SIZE);
	const q = (input.q ?? '').trim();
	const tier = normalizeFilter(input.tier, TIER_FILTERS);
	const status = normalizeFilter(input.status, statusFilters);
	const from = (page - 1) * pageSize;

	return {
		page,
		pageSize,
		q,
		tier,
		status,
		statusScope,
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
		tier: query.tier,
		status: query.status
	};
}

function getPersonnelCapForTier(tier: string): number | null {
	const config = TIER_CONFIG[tier as Tier];
	if (!config) return null;
	return config.personnelCap === Infinity ? null : config.personnelCap;
}

async function mapWithConcurrency<T, U>(items: T[], limit: number, mapper: (item: T) => Promise<U>): Promise<U[]> {
	const results = new Array<U>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

async function readBillingSnapshots(
	store: PlatformOrganizationLedgerStore,
	organizationIds: string[]
): Promise<{ snapshotsByOrgId: Map<string, BillingSnapshot>; billingDiagnosticsError: boolean }> {
	if (organizationIds.length === 0) {
		return { snapshotsByOrgId: new Map(), billingDiagnosticsError: false };
	}

	try {
		return {
			snapshotsByOrgId: await store.listBillingSnapshotsByOrganization(organizationIds),
			billingDiagnosticsError: false
		};
	} catch (err) {
		console.error('Admin billing snapshots query failed:', err);
		return { snapshotsByOrgId: new Map(), billingDiagnosticsError: true };
	}
}

async function readPlanDiagnostics(
	deps: PlatformOrganizationLedgerDependencies,
	organizationIds: string[]
): Promise<{ planDiagnosticsByOrgId: Map<string, PlanAdminDiagnostics | null>; planDiagnosticsError: boolean }> {
	if (organizationIds.length === 0 || !deps.readPlanDiagnostics) {
		return { planDiagnosticsByOrgId: new Map(), planDiagnosticsError: false };
	}

	const results = await mapWithConcurrency(organizationIds, PLAN_DIAGNOSTICS_CONCURRENCY, async (orgId) => {
		try {
			return { orgId, diagnostics: await deps.readPlanDiagnostics!(orgId), error: false };
		} catch (err) {
			console.error('Admin plan diagnostics query failed:', { orgId, err });
			return { orgId, diagnostics: null, error: true };
		}
	});

	return {
		planDiagnosticsByOrgId: new Map(results.map((result) => [result.orgId, result.diagnostics])),
		planDiagnosticsError: results.some((result) => result.error)
	};
}

async function readOrganizationPage(
	deps: PlatformOrganizationLedgerDependencies,
	input: PlatformOrganizationLedgerInput = {},
	statusFilters: ReadonlySet<string> = ORGANIZATION_STATUS_FILTERS,
	statusScope: PlatformOrganizationLedgerQuery['statusScope'] = 'organizations'
): Promise<{
	query: PlatformOrganizationLedgerQuery;
	rows: PlatformOrganizationLedgerBaseRow[];
	pagination: PlatformOrganizationLedgerPageMetadata;
}> {
	const query = normalizePlatformOrganizationLedgerQuery(input, statusFilters, statusScope);
	const page = await deps.store.listOrganizationsPage(query);

	return {
		query,
		rows: page.organizations,
		pagination: buildPagination(query, page.totalCount)
	};
}

export function createPlatformOrganizationLedger(
	deps: PlatformOrganizationLedgerDependencies
): PlatformOrganizationLedger {
	return {
		async listOrganizations(input = {}) {
			const { rows, pagination } = await readOrganizationPage(
				deps,
				input,
				ORGANIZATION_STATUS_FILTERS,
				'organizations'
			);
			const orgIds = rows.map((org) => org.id);
			const metrics = await deps.metrics.getOrganizationMetrics(orgIds);

			return {
				organizations: rows.map((org) => {
					const ownerEmail = displayOwnerMembership(metrics.ownerMemberships.get(org.id));

					return {
						...org,
						effectiveTier: (org.gift_tier ?? org.tier ?? 'free') as string,
						memberCount: metrics.memberCounts.get(org.id) ?? 0,
						personnelCount: metrics.activePersonnelCounts.get(org.id) ?? 0,
						ownerEmail,
						isSuspended: !!org.suspended_at
					};
				}),
				pagination
			};
		},

		async listSubscriptions(input = {}) {
			const { rows, pagination } = await readOrganizationPage(
				deps,
				input,
				SUBSCRIPTION_STATUS_FILTERS,
				'subscriptions'
			);
			const orgIds = rows.map((org) => org.id);

			const [personnelCounts, ownerMemberships, billingRead, planRead] = await Promise.all([
				deps.metrics.countActivePersonnelByOrganization(orgIds),
				deps.metrics.getOwnerMembershipsByOrganization(orgIds),
				readBillingSnapshots(deps.store, orgIds),
				readPlanDiagnostics(deps, orgIds)
			]);

			return {
				subscriptions: rows.map((org) => {
					const ownerEmail = displayOwnerMembership(ownerMemberships.get(org.id));
					const billingSnapshot = visibleBillingSnapshotForAdminRole(
						deps.adminRole,
						billingRead.snapshotsByOrgId.get(org.id) ?? null
					);
					const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

					return {
						...org,
						effectiveTier,
						personnelCount: personnelCounts.get(org.id) ?? 0,
						personnelCap: getPersonnelCapForTier(effectiveTier),
						ownerEmail,
						isGifted: !!org.gift_tier,
						isSuspended: !!org.suspended_at,
						billingSnapshot,
						planDiagnostics: planRead.planDiagnosticsByOrgId.get(org.id) ?? null,
						cancellationSummary: billingSnapshot ? summarizeBillingCancellation(billingSnapshot) : null
					};
				}),
				pagination,
				billingDiagnosticsError: billingRead.billingDiagnosticsError,
				planDiagnosticsError: planRead.planDiagnosticsError
			};
		}
	};
}
