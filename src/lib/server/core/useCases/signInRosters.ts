import type { ScopeSet } from '$lib/access/memberAccessShape';
import { PERSONNEL_RANK_ORDER } from '$lib/domain/personnelRank';
import { fail } from '$lib/server/core/errors';
import type { SignInRosterPersonnelLookupRecord, UseCaseContext } from '$lib/server/core/ports';

const MAX_ROSTER_PERSONNEL = 500;
const RANK_INDEX = new Map<string, number>(PERSONNEL_RANK_ORDER.map((rank, index) => [rank, index]));

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
	const rowById = rowsById(rows);
	const personnelSnapshot = sortSnapshot(
		personnelIds.map((id) => canonicalSnapshotFor(rowById.get(id)!, groupNames)),
		sortBy
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
	if (ctx.signInRosterPersonnelLookup) {
		const rows = await ctx.signInRosterPersonnelLookup.findPersonnelForRosterSnapshot(ctx.auth.orgId, personnelIds);
		const order = new Map(personnelIds.map((id, index) => [id, index]));
		return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
	}

	const rows = await ctx.rawStore.findMany<PersonnelRow>('personnel', ctx.auth.orgId, undefined, {
		select: 'id, rank, last_name, first_name, group_id, groups(name)',
		inFilters: { id: personnelIds }
	});
	const order = new Map(personnelIds.map((id, index) => [id, index]));
	return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function loadGroupNames(ctx: UseCaseContext, rows: PersonnelRow[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (const row of rows) {
		const groupName = groupNameForRow(row);
		if (row.group_id && typeof groupName === 'string') {
			names.set(row.group_id, groupName);
		}
	}

	const missingGroupIds = uniqueStrings(
		rows.map((row) => row.group_id).filter((id): id is string => typeof id === 'string' && !names.has(id))
	);
	if (missingGroupIds.length === 0) return names;

	const groupRows = await ctx.rawStore.findMany<{ id: string; name?: string | null }>(
		'groups',
		ctx.auth.orgId,
		undefined,
		{
			select: 'id, name',
			inFilters: { id: missingGroupIds }
		}
	);
	for (const row of groupRows) {
		if (typeof row.name === 'string') names.set(row.id, row.name);
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

function groupNameForRow(row: PersonnelRow): string | null {
	if (typeof row.group_name === 'string') return row.group_name;
	if (Array.isArray(row.groups)) {
		const first = row.groups.find((group) => typeof group?.name === 'string');
		return first?.name ?? null;
	}
	return row.groups?.name ?? null;
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
	sortBy: 'alphabetical' | 'rank'
): CanonicalSignInRosterSnapshot[] {
	return [...snapshot].sort((a, b) => {
		if (sortBy === 'rank') {
			const rankA = RANK_INDEX.get(a.rank) ?? PERSONNEL_RANK_ORDER.length;
			const rankB = RANK_INDEX.get(b.rank) ?? PERSONNEL_RANK_ORDER.length;
			if (rankA !== rankB) return rankA - rankB;
		}

		const lastDiff = a.lastName.localeCompare(b.lastName);
		if (lastDiff !== 0) return lastDiff;
		return a.firstName.localeCompare(b.firstName);
	});
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
