import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
import { sortSignInRosterRows } from '$features/sign-in-rosters/signInRosterRankOrder';
import { findGroupNamesByIds } from '$features/personnel/index.server';
import { fail } from '$lib/server/core/errors';
import type { SignInRosterPersonnelLookupRecord } from '$features/personnel/contracts';
import type { UseCaseContext } from '$lib/server/core/ports';

const MAX_ROSTER_PERSONNEL = 500;
const RANK_CATALOG_TABLE = 'organization_rank_catalog';

type PersonnelRow = SignInRosterPersonnelLookupRecord;

export interface CanonicalSignInRosterSnapshot {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	groupId: string | null;
}

export interface PreparedSignInRosterSnapshot {
	personnelIds: string[];
	scopeGroupIds: string[];
	personnelSnapshot: CanonicalSignInRosterSnapshot[];
	filterConfig: { groups: string[]; ranks: string[] } | null;
	sortBy: 'alphabetical' | 'rank';
}

export async function prepareSignInRosterSnapshot(
	ctx: UseCaseContext,
	input: Record<string, unknown>
): Promise<PreparedSignInRosterSnapshot> {
	const personnelIds = extractRequestedPersonnelIds(input);
	const rows = await loadPersonnelRows(ctx, personnelIds);

	if (rows.length !== personnelIds.length) {
		fail(400, 'Personnel selection includes unknown personnel');
	}

	assertPersonnelRowsWithinScope(ctx.auth.scopeSet, rows);

	const groupNames = await loadGroupNames(ctx, rows);
	const sortBy = input.sortBy === 'rank' ? 'rank' : 'alphabetical';
	const rankCatalog = sortBy === 'rank' ? await loadSignInRosterRankCatalog(ctx) : [];
	const rowById = rowsById(rows);
	const personnelSnapshot = sortSnapshot(
		personnelIds.map((id) => canonicalSnapshotFor(rowById.get(id)!, groupNames)),
		sortBy,
		rankCatalog.length > 0 ? rankCatalog : undefined
	);

	return {
		personnelIds,
		scopeGroupIds: scopeGroupIdsForRows(rows),
		personnelSnapshot,
		filterConfig: sanitizeFilterConfig(input.filterConfig),
		sortBy
	};
}

function extractRequestedPersonnelIds(input: Record<string, unknown>): string[] {
	const personnelIds = input.personnelIds;
	if (Array.isArray(personnelIds)) {
		return validatePersonnelIds(personnelIds, 'Personnel selection contains a missing or invalid id');
	}

	const snapshot = input.personnelSnapshot;
	if (!Array.isArray(snapshot) || snapshot.length === 0) {
		fail(400, 'Personnel snapshot is required');
	}

	return validatePersonnelIds(
		snapshot.map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>).id : undefined)),
		'Personnel snapshot contains a missing or invalid id'
	);
}

function validatePersonnelIds(values: unknown[], invalidMessage: string): string[] {
	if (values.length === 0) {
		fail(400, 'Personnel snapshot is required');
	}
	if (values.length > MAX_ROSTER_PERSONNEL) {
		fail(400, `Personnel selection is limited to ${MAX_ROSTER_PERSONNEL} personnel`);
	}

	const ids = values.map((value) => {
		if (typeof value !== 'string' || value.trim().length === 0) {
			fail(400, invalidMessage);
		}
		return value.trim();
	});

	if (new Set(ids).size !== ids.length) {
		fail(400, 'Personnel selection contains duplicate ids');
	}

	return ids;
}

async function loadPersonnelRows(ctx: UseCaseContext, personnelIds: string[]): Promise<PersonnelRow[]> {
	if (!ctx.signInRosterPersonnelLookup) throw new Error('Sign-in roster Personnel lookup is unavailable');
	const rows = await ctx.signInRosterPersonnelLookup.findPersonnelForRosterSnapshot(ctx.auth.orgId, personnelIds);
	const order = new Map(personnelIds.map((id, index) => [id, index]));
	return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function loadGroupNames(ctx: UseCaseContext, rows: PersonnelRow[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (const row of rows) {
		const groupName = row.group_name;
		if (row.group_id && typeof groupName === 'string') {
			names.set(row.group_id, groupName);
		}
	}

	const missingGroupIds = uniqueStrings(
		rows.map((row) => row.group_id).filter((id): id is string => typeof id === 'string' && !names.has(id))
	);
	if (missingGroupIds.length === 0) return names;

	for (const [id, name] of await findGroupNamesByIds({ auth: ctx.auth, store: ctx.rawStore }, missingGroupIds)) {
		names.set(id, name);
	}
	return names;
}

function assertPersonnelRowsWithinScope(scopeSet: ScopeSet, rows: PersonnelRow[]): void {
	if (scopeSet.kind === 'organization') return;

	const allowedGroups = new Set(scopeSet.groupIds);
	for (const row of rows) {
		if (!row.group_id || !allowedGroups.has(row.group_id)) {
			fail(403, 'You do not have access to personnel outside your group');
		}
	}
}

function scopeGroupIdsForRows(rows: PersonnelRow[]): string[] {
	if (rows.some((row) => !row.group_id)) return [];
	return uniqueStrings(rows.map((row) => row.group_id).filter((id): id is string => typeof id === 'string'));
}

function rowsById(rows: PersonnelRow[]): Map<string, PersonnelRow> {
	return new Map(rows.map((row) => [row.id, row]));
}

function canonicalSnapshotFor(row: PersonnelRow, groupNames: Map<string, string>): CanonicalSignInRosterSnapshot {
	return {
		id: row.id,
		rank: row.rank ?? '',
		lastName: row.last_name ?? '',
		firstName: row.first_name ?? '',
		group: row.group_id ? (groupNames.get(row.group_id) ?? '') : '',
		groupId: row.group_id ?? null
	};
}

function sortSnapshot(
	snapshot: CanonicalSignInRosterSnapshot[],
	sortBy: 'alphabetical' | 'rank',
	rankCatalog?: readonly RankCatalogEntry[]
): CanonicalSignInRosterSnapshot[] {
	return sortSignInRosterRows(snapshot, sortBy, rankCatalog);
}

async function loadSignInRosterRankCatalog(ctx: UseCaseContext): Promise<RankCatalogEntry[]> {
	const rows = await ctx.rawStore.findMany<{
		code: string;
		label: string;
		service: RankCatalogEntry['service'];
		category: RankCatalogEntry['category'];
		pay_grade: RankCatalogEntry['payGrade'];
		state: RankCatalogEntry['state'];
		sort_order: number;
	}>(RANK_CATALOG_TABLE, ctx.auth.orgId);

	return rows.map((row) => ({
		code: row.code,
		label: row.label,
		service: row.service,
		category: row.category,
		payGrade: row.pay_grade,
		state: row.state,
		sortOrder: row.sort_order
	}));
}

function sanitizeFilterConfig(value: unknown): { groups: string[]; ranks: string[] } | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const config = value as Record<string, unknown>;
	return {
		groups: stringArray(config.groups),
		ranks: stringArray(config.ranks)
	};
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return uniqueStrings(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()));
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
