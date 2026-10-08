import type { RankCatalogPersistence, RankCatalogSave, SavedRankCatalogEntry } from './rankCatalogPersistence';
import type { PersonnelRecordPersistence } from './contracts';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import {
	BUILT_IN_RANK_CATALOG,
	compareRankCodes,
	resolveBuiltInRank,
	type RankCatalogEntry,
	type RankCategory,
	type RankPayGrade,
	type RankService,
	type RankState
} from './rankCatalog';
import type {
	OrganizationRankCatalogEntry,
	OrganizationRankCatalogReferenceSummary,
	OrganizationRankCatalogSource,
	SaveOrganizationRankCatalogEntryInput,
	AddOrganizationRankServicePackResult,
	BulkSetOrganizationRankCatalogStateResult
} from './rankCatalogContracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { sanitizeString } from '$lib/server/validation';
import { requireFeaturePolicy, requireGovernancePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';

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
const RANK_SERVICE_PACK_SERVICES = new Set<RankService>([
	'army',
	'navy',
	'air-force',
	'marine-corps',
	'coast-guard',
	'space-force'
]);
const DEFAULT_RANK_CATALOG_SERVICES = new Set<RankService>(['army', 'civilian', 'custom']);
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
const PG_INTEGER_MIN = -2_147_483_648;
const PG_INTEGER_MAX = 2_147_483_647;

export interface RankCatalogAdministrationPort {
	deleteRankCatalogEntry(orgId: string, entryId: string, code: string): Promise<void>;
}

interface RankReferenceMatcher {
	matches(value: unknown, code: string): boolean;
}

type OrganizationRankCatalogRow = SavedRankCatalogEntry;

interface TrainingTypeRankReferenceRow {
	appliesToRanks: unknown;
	excludedRanks: unknown;
}

type ReadTrainingRankApplicabilityReferences = () => Promise<TrainingTypeRankReferenceRow[]>;

type ReadSignInRosterRankReferences = () => Promise<
	{ filterRanks: readonly string[]; snapshotRanks: readonly string[] }[]
>;

interface RankCatalogPorts {
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'listRankReferences'>;
	auth: OrganizationAccessGrant;
	rankCatalog: RankCatalogPersistence;
	audit: PolicyAuditSink;
}

type RankCatalogReadPorts = Pick<RankCatalogPorts, 'auth'> & {
	rankCatalog: Pick<RankCatalogPersistence, 'listEntries'>;
	audit?: PolicyAuditSink;
};

type RankCatalogReadAuthorization =
	| 'personnel-view'
	| 'training-view'
	| 'training-records'
	| 'critical-tasks-readiness'
	| 'organization-governance';

interface RankCatalogReadOptions {
	authorization?: RankCatalogReadAuthorization;
}

const NOOP_AUDIT_PORT: PolicyAuditSink = { log() {} };

async function requireRankCatalogReadPolicy(
	ports: RankCatalogReadPorts,
	authorization: RankCatalogReadAuthorization
): Promise<void> {
	if (authorization === 'organization-governance') {
		await requireGovernancePolicy(
			{
				auth: ports.auth,
				audit: ports.audit ?? NOOP_AUDIT_PORT
			},
			POLICY_ACTION_CATALOG.organization.accessGovernance
		);
		return;
	}

	const action =
		authorization === 'training-view'
			? POLICY_ACTION_CATALOG.training.viewMatrix
			: authorization === 'training-records'
				? POLICY_ACTION_CATALOG.training.viewRecords
				: authorization === 'critical-tasks-readiness'
					? POLICY_ACTION_CATALOG.criticalTasks.viewReadiness
					: POLICY_ACTION_CATALOG.personnel.viewRoster;
	await requireFeaturePolicy(ports, action, { kind: 'unscoped' }, 'organization_rank_catalog', undefined);
}

export async function loadOrganizationRankCatalog(
	ports: RankCatalogReadPorts,
	options: RankCatalogReadOptions = {}
): Promise<OrganizationRankCatalogEntry[]> {
	await requireRankCatalogReadPolicy(ports, options.authorization ?? 'personnel-view');
	const rows = await ports.rankCatalog.listEntries();

	return sortCatalog(rows.map(deserializeRankCatalogRow));
}

export async function ensureOrganizationRankCatalog(ports: RankCatalogPorts): Promise<OrganizationRankCatalogEntry[]> {
	const existing = await loadOrganizationRankCatalog(ports);
	const existingCodes = new Set(existing.map((entry) => entry.code));
	const missingDefaultRows = buildDefaultRankCatalogSeeds().filter((row) => !existingCodes.has(row.code));
	const seededCatalogCodes = new Set([...existingCodes, ...missingDefaultRows.map((row) => row.code)]);
	const missingDiscoveredRows = await buildDiscoveredRankCatalogSeeds(ports, seededCatalogCodes);
	const missingRows = [...missingDefaultRows, ...missingDiscoveredRows];

	if (missingRows.length > 0) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
		await ports.rankCatalog.saveEntries(missingRows);
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
	const intent = input.intent ?? 'upsert';
	const originalCode = sanitizeString(input.originalCode ?? '', 80);
	if (intent === 'update') {
		if (!originalCode) {
			fail(400, 'Original rank code is required');
		}
		if (originalCode !== entry.code) {
			fail(400, 'Rank code cannot be changed from this edit form.');
		}
	}

	const existing = await ports.rankCatalog.findEntryByCode(entry.code);
	if (intent === 'create' && existing) {
		fail(409, 'Rank catalog entry already exists. Edit it instead.');
	}
	if (intent === 'update' && !existing) {
		fail(404, 'Rank catalog entry not found');
	}

	const builtInEntry = resolveBuiltInRank(entry.code);
	const entryToSave = builtInEntry
		? {
				...builtInEntry,
				state: existing?.source === 'built-in' ? existing.state : builtInEntry.state
			}
		: entry;
	const source = builtInEntry ? 'built-in' : (existing?.source ?? 'custom');
	const [saved] = await ports.rankCatalog.saveEntries([serializeRankCatalogEntry(entryToSave, source)]);

	if (!saved) {
		fail(500, 'Failed to save rank catalog entry');
	}

	const savedEntry = deserializeRankCatalogRow(saved);
	ports.audit.log({
		action: 'organization.rank_catalog.saved',
		resourceType: 'organization_rank_catalog',
		resourceId: saved.id,
		details: rankCatalogAuditDetails(savedEntry)
	});

	return savedEntry;
}

export async function addOrganizationRankServicePack(
	ports: RankCatalogPorts,
	input: { service: RankService }
): Promise<AddOrganizationRankServicePackResult> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	if (!RANK_SERVICES.has(input.service)) {
		fail(400, 'Invalid rank service');
	}
	if (!RANK_SERVICE_PACK_SERVICES.has(input.service)) {
		fail(400, 'Invalid rank service pack');
	}

	const servicePack = BUILT_IN_RANK_CATALOG.filter((entry) => entry.service === input.service);
	if (servicePack.length === 0) {
		fail(400, 'No built-in rank service pack is available for this service');
	}

	const existing = await ports.rankCatalog.listEntries();
	const existingByCode = new Map(existing.map((entry) => [entry.code, entry]));
	const rowsToUpsert: RankCatalogSave[] = [];
	const rowsToCanonicalize: Array<{ id: string; entry: RankCatalogEntry }> = [];

	for (const entry of servicePack) {
		const exactExisting = existingByCode.get(entry.code);
		if (exactExisting?.source === 'built-in') {
			continue;
		}
		if (exactExisting) {
			rowsToUpsert.push(serializeRankCatalogEntry({ ...entry, state: exactExisting.state }, 'built-in'));
			continue;
		}
		const aliasExisting = existing.find(
			(row) => row.id && row.code.toUpperCase() === entry.code.toUpperCase() && row.source !== 'built-in'
		);
		if (aliasExisting?.id) {
			rowsToCanonicalize.push({ id: aliasExisting.id, entry: { ...entry, state: aliasExisting.state } });
			continue;
		}
		rowsToUpsert.push(serializeRankCatalogEntry(entry, 'built-in'));
	}

	const savedRows = await ports.rankCatalog.saveEntries(rowsToUpsert);
	const canonicalizedRows = await Promise.all(
		rowsToCanonicalize.map(({ id, entry }) =>
			ports.rankCatalog.patchEntryById(id, serializeRankCatalogEntry(entry, 'built-in'))
		)
	);
	const changedCount = rowsToUpsert.length + rowsToCanonicalize.length;
	const entries = sortCatalog([...savedRows, ...canonicalizedRows].map(deserializeRankCatalogRow));
	const result = {
		service: input.service,
		addedCount: changedCount,
		skippedExistingCount: servicePack.length - changedCount,
		entries
	};

	ports.audit.log({
		action: 'organization.rank_catalog.service_pack_added',
		resourceType: 'organization_rank_catalog',
		resourceId: ports.auth.orgId,
		details: {
			service: input.service,
			addedCount: result.addedCount,
			skippedExistingCount: result.skippedExistingCount
		}
	});

	return result;
}

export async function bulkSetOrganizationRankCatalogState(
	ports: RankCatalogPorts,
	input: { service: RankService; targetState: RankState }
): Promise<BulkSetOrganizationRankCatalogStateResult> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	if (!RANK_SERVICE_PACK_SERVICES.has(input.service)) {
		fail(400, 'Invalid rank service pack');
	}
	if (!RANK_STATES.has(input.targetState)) {
		fail(400, 'Invalid rank state');
	}

	const existing = await ports.rankCatalog.listEntries();
	const rowsToUpdate = existing
		.filter(
			(entry) => entry.service === input.service && entry.source === 'built-in' && entry.state !== input.targetState
		)
		.map((entry) => ({ ...entry, state: input.targetState }));
	const savedRows = await ports.rankCatalog.saveEntries(rowsToUpdate);
	const entries = sortCatalog(savedRows.map(deserializeRankCatalogRow));
	const result = {
		service: input.service,
		targetState: input.targetState,
		changedCount: savedRows.length,
		entries
	};

	ports.audit.log({
		action: 'organization.rank_catalog.bulk_state_changed',
		resourceType: 'organization_rank_catalog',
		resourceId: ports.auth.orgId,
		details: {
			service: input.service,
			targetState: input.targetState,
			changedCount: result.changedCount
		}
	});

	return result;
}

export async function loadOrganizationRankCatalogReferenceSummaries(
	ports: Pick<RankCatalogPorts, 'auth' | 'rankCatalog' | 'audit' | 'organizationPersonnel'>,
	input: { codes: readonly string[] },
	readTrainingRankApplicabilityReferences: ReadTrainingRankApplicabilityReferences,
	readSignInRosterRankReferences: ReadSignInRosterRankReferences,
	options: RankCatalogReadOptions = {}
): Promise<OrganizationRankCatalogReferenceSummary[]> {
	await requireRankCatalogReadPolicy(ports, options.authorization ?? 'personnel-view');

	const codes = [...new Set(input.codes.map((code) => sanitizeString(code, 80)).filter(Boolean))];
	const summaries = new Map(codes.map((code) => [code, createEmptyReferenceSummary(code)]));
	const referenceMatcher = createRankReferenceMatcher(codes);

	if (codes.length === 0) {
		return [];
	}

	const [personnelRows, trainingTypeRows, signInRosterRows] = await Promise.all([
		ports.organizationPersonnel.listRankReferences(),
		readTrainingRankApplicabilityReferences(),
		readSignInRosterRankReferences()
	]);

	for (const code of codes) {
		const summary = summaries.get(code);
		if (!summary) continue;

		summary.activeReferences.personnel = personnelRows.filter((row) => referenceMatcher.matches(row.rank, code)).length;
		summary.activeReferences.trainingApplicability = trainingTypeRows.reduce((count, row) => {
			return (
				count +
				countArrayReferences(row.appliesToRanks, code, referenceMatcher) +
				countArrayReferences(row.excludedRanks, code, referenceMatcher)
			);
		}, 0);
		summary.activeReferences.total =
			summary.activeReferences.personnel + summary.activeReferences.trainingApplicability;

		summary.historicalReferences.signInRosterFilters = signInRosterRows.filter((row) =>
			arrayContainsRankReference(row.filterRanks, code, referenceMatcher)
		).length;
		summary.historicalReferences.signInRosterSnapshots = signInRosterRows.filter((row) =>
			arrayContainsRankReference(row.snapshotRanks, code, referenceMatcher)
		).length;
		summary.historicalReferences.total =
			summary.historicalReferences.signInRosterFilters + summary.historicalReferences.signInRosterSnapshots;
		summary.canDelete = summary.activeReferences.total === 0 && summary.historicalReferences.total === 0;
	}

	return codes.map((code) => summaries.get(code) ?? createEmptyReferenceSummary(code));
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

	const existing = await ports.rankCatalog.findEntryByCode(code);
	if (!existing) {
		fail(404, 'Rank catalog entry not found');
	}

	const [saved] = await ports.rankCatalog.saveEntries([{ ...existing, state: 'retired' }]);

	if (!saved) {
		fail(500, 'Failed to retire rank catalog entry');
	}

	const retiredEntry = deserializeRankCatalogRow(saved);
	ports.audit.log({
		action: 'organization.rank_catalog.retired',
		resourceType: 'organization_rank_catalog',
		resourceId: saved.id,
		details: rankCatalogAuditDetails(retiredEntry)
	});

	return retiredEntry;
}

export async function reactivateOrganizationRankCatalogEntry(
	ports: RankCatalogPorts,
	input: { code: string }
): Promise<OrganizationRankCatalogEntry> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	const code = sanitizeString(input.code, 80);
	if (!code) {
		fail(400, 'Rank code is required');
	}

	const existing = await ports.rankCatalog.findEntryByCode(code);
	if (!existing) {
		fail(404, 'Rank catalog entry not found');
	}

	const [saved] = await ports.rankCatalog.saveEntries([{ ...existing, state: 'active' }]);

	if (!saved) {
		fail(500, 'Failed to reactivate rank catalog entry');
	}

	const reactivatedEntry = deserializeRankCatalogRow(saved);
	ports.audit.log({
		action: 'organization.rank_catalog.reactivated',
		resourceType: 'organization_rank_catalog',
		resourceId: saved.id,
		details: rankCatalogAuditDetails(reactivatedEntry)
	});

	return reactivatedEntry;
}

export async function removeOrganizationRankCatalogEntry(
	ports: RankCatalogPorts & { rankCatalogAdministration: RankCatalogAdministrationPort },
	input: { code: string },
	readTrainingRankApplicabilityReferences: ReadTrainingRankApplicabilityReferences,
	readSignInRosterRankReferences: ReadSignInRosterRankReferences
): Promise<void> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);

	const code = sanitizeString(input.code, 80);
	if (!code) {
		fail(400, 'Rank code is required');
	}

	const existing = await ports.rankCatalog.findEntryByCode(code);
	if (!existing) {
		fail(404, 'Rank catalog entry not found');
	}
	if (existing.source === 'built-in') {
		fail(409, 'Built-in ranks cannot be removed. Retire them instead.');
	}
	if (!existing.id) {
		fail(500, 'Rank catalog entry is missing its storage identifier');
	}

	const catalog = await loadOrganizationRankCatalog(ports, { authorization: 'organization-governance' });
	const summaryCodes = [...new Set([code, ...catalog.map((entry) => entry.code)])];
	const references = (
		await loadOrganizationRankCatalogReferenceSummaries(
			ports,
			{ codes: summaryCodes },
			readTrainingRankApplicabilityReferences,
			readSignInRosterRankReferences,
			{ authorization: 'organization-governance' }
		)
	).find((summary) => summary.code === code);
	if (references?.activeReferences.total) {
		fail(409, 'Rank is referenced by active Organization data. Retire it instead.');
	}
	if (references?.historicalReferences.total) {
		fail(409, 'Rank is referenced by Organization data. Retire it instead.');
	}

	await ports.rankCatalogAdministration.deleteRankCatalogEntry(ports.auth.orgId, existing.id, code);

	ports.audit.log({
		action: 'organization.rank_catalog.deleted',
		resourceType: 'organization_rank_catalog',
		resourceId: existing.id,
		details: {
			code,
			label: existing.label,
			source: existing.source,
			activeReferenceTotal: references?.activeReferences.total ?? 0,
			historicalReferenceTotal: references?.historicalReferences.total ?? 0
		}
	});
}

export function buildDefaultRankCatalogSeeds(): RankCatalogSave[] {
	return BUILT_IN_RANK_CATALOG.filter((entry) => DEFAULT_RANK_CATALOG_SERVICES.has(entry.service)).map((entry) =>
		serializeRankCatalogEntry(entry, 'built-in')
	);
}

async function buildDiscoveredRankCatalogSeeds(
	ports: RankCatalogPorts,
	existingCodes: Set<string>
): Promise<RankCatalogSave[]> {
	const personnelRows = await ports.organizationPersonnel.listRankReferences();
	const discoveredCodes = new Set<string>();
	const rows: RankCatalogSave[] = [];

	for (const personnel of personnelRows) {
		const rank = sanitizeDiscoveredRankCode(personnel.rank);
		if (!rank || hasCatalogCodeAlias(existingCodes, rank) || hasCatalogCodeAlias(discoveredCodes, rank)) {
			continue;
		}

		discoveredCodes.add(rank);
		rows.push(
			serializeRankCatalogEntry(
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

function hasCatalogCodeAlias(codes: Set<string>, code: string): boolean {
	const normalizedCode = code.toUpperCase();
	for (const candidate of codes) {
		if (candidate.toUpperCase() === normalizedCode) {
			return true;
		}
	}
	return false;
}

function serializeRankCatalogEntry(entry: RankCatalogEntry, source: OrganizationRankCatalogSource): RankCatalogSave {
	return {
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

	const sortOrder = Number.isFinite(input.sortOrder) ? input.sortOrder : 0;
	if (!Number.isInteger(sortOrder) || sortOrder < PG_INTEGER_MIN || sortOrder > PG_INTEGER_MAX) {
		fail(400, 'Tie-break order must fit within PostgreSQL integer range.');
	}

	return {
		...input,
		code: resolveBuiltInRank(code)?.code ?? code,
		label,
		sortOrder
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

function createEmptyReferenceSummary(code: string): OrganizationRankCatalogReferenceSummary {
	return {
		code,
		activeReferences: {
			personnel: 0,
			trainingApplicability: 0,
			total: 0
		},
		historicalReferences: {
			signInRosterFilters: 0,
			signInRosterSnapshots: 0,
			total: 0
		},
		canDelete: true
	};
}

function countArrayReferences(value: unknown, code: string, matcher: RankReferenceMatcher): number {
	if (!Array.isArray(value)) {
		return 0;
	}

	return value.filter((entry) => matcher.matches(entry, code)).length;
}

function arrayContainsRankReference(value: unknown, code: string, matcher: RankReferenceMatcher): boolean {
	return Array.isArray(value) && value.some((entry) => matcher.matches(entry, code));
}

function createRankReferenceMatcher(codes: readonly string[]): RankReferenceMatcher {
	const normalizedCodes = new Map<string, string | null>();

	for (const code of codes) {
		const normalized = code.toUpperCase();
		const existing = normalizedCodes.get(normalized);
		if (existing === undefined) {
			normalizedCodes.set(normalized, code);
		} else if (existing !== code) {
			normalizedCodes.set(normalized, null);
		}
	}

	return {
		matches(value, code) {
			if (typeof value !== 'string') {
				return false;
			}

			const reference = normalizeRankReference(value);
			if (reference === code) {
				return true;
			}

			return normalizedCodes.get(reference.toUpperCase()) === code;
		}
	};
}

function normalizeRankReference(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function sortCatalog(entries: OrganizationRankCatalogEntry[]): OrganizationRankCatalogEntry[] {
	return entries.toSorted((a, b) => compareRankCodes(a.code, b.code, { catalog: entries }));
}
