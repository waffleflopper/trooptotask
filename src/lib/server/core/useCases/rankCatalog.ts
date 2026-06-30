import {
	BUILT_IN_RANK_CATALOG,
	compareRankCodes,
	resolveBuiltInRank,
	type RankCatalogEntry,
	type RankCategory,
	type RankPayGrade,
	type RankService,
	type RankState
} from '$lib/domain/rankCatalog';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import { sanitizeString } from '$lib/server/validation';
import { requireFeaturePolicy } from './featurePolicy';
import { requireGovernancePolicy } from './governancePolicy';

const RANK_CATALOG_TABLE = 'organization_rank_catalog';
const RANK_SERVICES = new Set<RankService>([
	'army',
	'navy',
	'air-force',
	'marine-corps',
	'coast-guard',
	'space-force',
	'civilian',
	'custom'
]);
const RANK_CATEGORIES = new Set<RankCategory>(['officer', 'warrant', 'enlisted', 'civilian', 'custom']);
const RANK_STATES = new Set<RankState>(['active', 'retired']);
const RANK_PAY_GRADES = new Set<RankPayGrade>([
	'O-1',
	'O-2',
	'O-3',
	'O-4',
	'O-5',
	'O-6',
	'O-7',
	'O-8',
	'O-9',
	'O-10',
	'W-1',
	'W-2',
	'W-3',
	'W-4',
	'W-5',
	'E-1',
	'E-2',
	'E-3',
	'E-4',
	'E-5',
	'E-6',
	'E-7',
	'E-8',
	'E-9',
	'ungraded'
]);
const BUILT_IN_RANK_CODES_NORMALIZED = new Set(BUILT_IN_RANK_CATALOG.map((entry) => entry.code.toUpperCase()));

export type OrganizationRankCatalogSource = 'built-in' | 'discovered' | 'custom';

export interface OrganizationRankCatalogEntry extends RankCatalogEntry {
	organizationId: string;
	source: OrganizationRankCatalogSource;
}

export type SaveOrganizationRankCatalogEntryInput = Omit<RankCatalogEntry, 'source'>;

interface OrganizationRankCatalogRow extends Record<string, unknown> {
	id?: string;
	organization_id: string;
	code: string;
	label: string;
	service: RankService;
	category: RankCategory;
	pay_grade: RankPayGrade;
	state: RankState;
	source: OrganizationRankCatalogSource;
	sort_order: number;
}

interface PersonnelRankRow {
	rank?: string | null;
}

interface RankCatalogPorts {
	auth: AuthContext;
	store: DataStore;
	rawStore?: DataStore;
	audit: AuditPort;
	readOnlyGuard?: ReadOnlyGuard;
}

export async function loadOrganizationRankCatalog(ports: RankCatalogPorts): Promise<OrganizationRankCatalogEntry[]> {
	await requireFeaturePolicy(
		ports,
		POLICY_ACTION_CATALOG.personnel.viewRoster,
		{ kind: 'unscoped' },
		'organization_rank_catalog',
		undefined,
		{ enforceReadOnlyOverlay: false }
	);
	const rows = await storeForRankCatalog(ports).findMany<OrganizationRankCatalogRow>(
		RANK_CATALOG_TABLE,
		ports.auth.orgId
	);

	return sortCatalog(rows.map(deserializeRankCatalogRow));
}

export async function ensureOrganizationRankCatalog(ports: RankCatalogPorts): Promise<OrganizationRankCatalogEntry[]> {
	const existing = await loadOrganizationRankCatalog(ports);
	const existingCodes = new Set(existing.map((entry) => entry.code));
	const missingDefaultRows = buildDefaultRankCatalogSeeds(ports.auth.orgId).filter(
		(row) => !existingCodes.has(row.code)
	);
	const missingDiscoveredRows = await buildDiscoveredRankCatalogSeeds(ports, existingCodes);
	const missingRows = [...missingDefaultRows, ...missingDiscoveredRows];

	if (missingRows.length > 0) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
		await storeForRankCatalog(ports).upsertMany(RANK_CATALOG_TABLE, ports.auth.orgId, missingRows, {
			onConflict: 'organization_id,code'
		});
		ports.audit.log({
			action: 'organization.rank_catalog.reconciled',
			resourceType: 'organization_rank_catalog',
			resourceId: ports.auth.orgId,
			details: {
				defaultCount: missingDefaultRows.length,
				discoveredCount: missingDiscoveredRows.length
			}
		});
	}

	return loadOrganizationRankCatalog(ports);
}

export async function saveOrganizationRankCatalogEntry(
	ports: RankCatalogPorts,
	input: SaveOrganizationRankCatalogEntryInput
): Promise<OrganizationRankCatalogEntry> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	const entry = sanitizeRankCatalogEntry(input);
	const existing = await storeForRankCatalog(ports).findOne<OrganizationRankCatalogRow>(
		RANK_CATALOG_TABLE,
		ports.auth.orgId,
		{ code: entry.code }
	);
	const source = existing?.source ?? 'custom';
	const [saved] = await storeForRankCatalog(ports).upsertMany<OrganizationRankCatalogRow>(
		RANK_CATALOG_TABLE,
		ports.auth.orgId,
		[serializeRankCatalogEntry(ports.auth.orgId, entry, source)],
		{ onConflict: 'organization_id,code' }
	);

	if (!saved) {
		fail(500, 'Failed to save rank catalog entry');
	}

	const savedEntry = deserializeRankCatalogRow(saved);
	ports.audit.log({
		action: 'organization.rank_catalog.saved',
		resourceType: 'organization_rank_catalog',
		resourceId: savedEntry.code,
		details: rankCatalogAuditDetails(savedEntry)
	});

	return savedEntry;
}

export async function retireOrganizationRankCatalogEntry(
	ports: RankCatalogPorts,
	input: { code: string }
): Promise<OrganizationRankCatalogEntry> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	const code = sanitizeString(input.code, 80);
	if (!code) {
		fail(400, 'Rank code is required');
	}

	const existing = await storeForRankCatalog(ports).findOne<OrganizationRankCatalogRow>(
		RANK_CATALOG_TABLE,
		ports.auth.orgId,
		{ code }
	);
	if (!existing) {
		fail(404, 'Rank catalog entry not found');
	}

	const [saved] = await storeForRankCatalog(ports).upsertMany<OrganizationRankCatalogRow>(
		RANK_CATALOG_TABLE,
		ports.auth.orgId,
		[{ ...existing, state: 'retired' }],
		{ onConflict: 'organization_id,code' }
	);

	if (!saved) {
		fail(500, 'Failed to retire rank catalog entry');
	}

	const retiredEntry = deserializeRankCatalogRow(saved);
	ports.audit.log({
		action: 'organization.rank_catalog.retired',
		resourceType: 'organization_rank_catalog',
		resourceId: retiredEntry.code,
		details: rankCatalogAuditDetails(retiredEntry)
	});

	return retiredEntry;
}

export function buildDefaultRankCatalogSeeds(organizationId: string): OrganizationRankCatalogRow[] {
	return BUILT_IN_RANK_CATALOG.map((entry) => serializeRankCatalogEntry(organizationId, entry, 'built-in'));
}

async function buildDiscoveredRankCatalogSeeds(
	ports: RankCatalogPorts,
	existingCodes: Set<string>
): Promise<OrganizationRankCatalogRow[]> {
	const personnelRows = await storeForRankCatalog(ports).findMany<PersonnelRankRow>('personnel', ports.auth.orgId);
	const discoveredCodes = new Set<string>();
	const rows: OrganizationRankCatalogRow[] = [];

	for (const personnel of personnelRows) {
		const rank = sanitizeDiscoveredRankCode(personnel.rank);
		if (!rank || existingCodes.has(rank) || discoveredCodes.has(rank) || isKnownBuiltInRankCode(rank)) {
			continue;
		}

		discoveredCodes.add(rank);
		rows.push(
			serializeRankCatalogEntry(
				ports.auth.orgId,
				{
					code: rank,
					label: rank,
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					sortOrder: BUILT_IN_RANK_CATALOG.length + rows.length
				},
				'discovered'
			)
		);
	}

	return rows;
}

function sanitizeDiscoveredRankCode(rank: string | null | undefined): string | null {
	const canonicalRank = rank?.trim().replace(/\s+/g, ' ') ?? '';
	if (!canonicalRank || canonicalRank.length > 80) {
		return null;
	}

	const sanitizedRank = sanitizeString(rank, 80);
	return sanitizedRank === canonicalRank ? sanitizedRank : null;
}

function isKnownBuiltInRankCode(code: string): boolean {
	return Boolean(resolveBuiltInRank(code)) || BUILT_IN_RANK_CODES_NORMALIZED.has(code.toUpperCase());
}

function serializeRankCatalogEntry(
	organizationId: string,
	entry: RankCatalogEntry,
	source: OrganizationRankCatalogSource
): OrganizationRankCatalogRow {
	return {
		organization_id: organizationId,
		code: entry.code,
		label: entry.label,
		service: entry.service,
		category: entry.category,
		pay_grade: entry.payGrade,
		state: entry.state,
		source,
		sort_order: entry.sortOrder
	};
}

function sanitizeRankCatalogEntry(input: SaveOrganizationRankCatalogEntryInput): RankCatalogEntry {
	const code = sanitizeString(input.code, 80);
	const label = sanitizeString(input.label, 120);

	if (!code) {
		fail(400, 'Rank code is required');
	}
	if (!label) {
		fail(400, 'Rank label is required');
	}
	if (!RANK_SERVICES.has(input.service)) {
		fail(400, 'Invalid rank service');
	}
	if (!RANK_CATEGORIES.has(input.category)) {
		fail(400, 'Invalid rank category');
	}
	if (!isValidRankPayGrade(input.payGrade)) {
		fail(400, 'Invalid rank pay grade');
	}
	if (!RANK_STATES.has(input.state)) {
		fail(400, 'Invalid rank state');
	}

	return {
		...input,
		code: resolveBuiltInRank(code)?.code ?? code,
		label,
		sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0
	};
}

function isValidRankPayGrade(payGrade: RankPayGrade): boolean {
	return RANK_PAY_GRADES.has(payGrade);
}

function deserializeRankCatalogRow(row: OrganizationRankCatalogRow): OrganizationRankCatalogEntry {
	return {
		organizationId: row.organization_id,
		code: row.code,
		label: row.label,
		service: row.service,
		category: row.category,
		payGrade: row.pay_grade,
		state: row.state,
		source: row.source,
		sortOrder: row.sort_order
	};
}

function rankCatalogAuditDetails(entry: OrganizationRankCatalogEntry): Record<string, unknown> {
	return {
		code: entry.code,
		label: entry.label,
		payGrade: entry.payGrade,
		state: entry.state,
		source: entry.source
	};
}

function sortCatalog(entries: OrganizationRankCatalogEntry[]): OrganizationRankCatalogEntry[] {
	return entries.toSorted((a, b) => compareRankCodes(a.code, b.code, { catalog: entries }));
}

function storeForRankCatalog(ports: RankCatalogPorts): DataStore {
	return ports.rawStore ?? ports.store;
}
