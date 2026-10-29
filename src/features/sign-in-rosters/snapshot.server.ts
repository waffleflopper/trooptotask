import type { GroupCoverage } from '$lib/access/memberAccessShape';
import type {
	Group,
	RankCatalogEntry,
	SignInRosterPersonnelLookupPort,
	SignInRosterPersonnelLookupRecord
} from '$features/personnel/contracts';
import { sortSignInRosterRows } from './signInRosterRankOrder';
import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import type { SignInRosterFilter } from './signInRosterFilter';

const MAX_ROSTER_PERSONNEL = 500;

type PersonnelRow = SignInRosterPersonnelLookupRecord;

export interface SignInRosterSnapshotContext {
	orgId: string;
	scopeSet: GroupCoverage;
	personnelLookup?: SignInRosterPersonnelLookupPort;
	/** The Groups this saver can see. */
	listGroupCatalog(): Promise<Group[]>;
	loadRankCatalog(): Promise<RankCatalogEntry[]>;
}

export type CanonicalSignInRosterSnapshot = {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	groupId: string | null;
	/** The saver's visible Groups above `groupId`, top first, so a reprint labels every section as it was saved. */
	groupAncestors: SavedGroup[];
};

export type SavedGroup = { id: string; name: string };

export interface PreparedSignInRosterSnapshot {
	personnelIds: string[];
	scopeGroupIds: string[];
	personnelSnapshot: CanonicalSignInRosterSnapshot[];
	filterConfig: SignInRosterFilter | null;
	sortBy: 'alphabetical' | 'rank';
}

export async function prepareSignInRosterSnapshot(
	ctx: SignInRosterSnapshotContext,
	input: Record<string, unknown>
): Promise<PreparedSignInRosterSnapshot> {
	const personnelIds = extractRequestedPersonnelIds(input);
	const [rows, catalog] = await Promise.all([loadPersonnelRows(ctx, personnelIds), ctx.listGroupCatalog()]);

	if (rows.length !== personnelIds.length) {
		fail(400, 'Personnel selection includes unknown personnel');
	}

	const groupsById = new Map(catalog.map((group) => [group.id, group]));
	const sortBy = input.sortBy === 'rank' ? 'rank' : 'alphabetical';
	const rankCatalog = sortBy === 'rank' ? await ctx.loadRankCatalog() : [];
	const rowById = rowsById(rows);
	const personnelSnapshot = sortSnapshot(
		personnelIds.map((id) => canonicalSnapshotFor(rowById.get(id)!, groupsById)),
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
		const id = typeof value === 'string' ? value.trim() : '';
		if (!isUuid(id)) fail(400, invalidMessage);
		return id.toLowerCase();
	});

	if (new Set(ids).size !== ids.length) {
		fail(400, 'Personnel selection contains duplicate ids');
	}

	return ids;
}

async function loadPersonnelRows(ctx: SignInRosterSnapshotContext, personnelIds: string[]): Promise<PersonnelRow[]> {
	if (!ctx.personnelLookup) throw new Error('Sign-in roster Personnel lookup is unavailable');
	const rows = await ctx.personnelLookup.findPersonnelForRosterSnapshot(ctx.orgId, ctx.scopeSet, personnelIds);
	const order = new Map(personnelIds.map((id, index) => [id, index]));
	return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function scopeGroupIdsForRows(rows: PersonnelRow[]): string[] {
	if (rows.some((row) => !row.groupId)) return [];
	return uniqueStrings(rows.map((row) => row.groupId).filter((id): id is string => typeof id === 'string'));
}

function rowsById(rows: PersonnelRow[]): Map<string, PersonnelRow> {
	return new Map(rows.map((row) => [row.id, row]));
}

function canonicalSnapshotFor(row: PersonnelRow, groupsById: Map<string, Group>): CanonicalSignInRosterSnapshot {
	const group = row.groupId ? groupsById.get(row.groupId) : undefined;
	return {
		id: row.id,
		rank: row.rank ?? '',
		lastName: row.lastName ?? '',
		firstName: row.firstName ?? '',
		group: row.groupName ?? group?.name ?? '',
		groupId: row.groupId ?? null,
		groupAncestors: ancestorsOf(group, groupsById)
	};
}

function ancestorsOf(group: Group | undefined, groupsById: Map<string, Group>): SavedGroup[] {
	const parent = group?.parentId ? groupsById.get(group.parentId) : undefined;
	return parent ? [...ancestorsOf(parent, groupsById), { id: parent.id, name: parent.name }] : [];
}

function sortSnapshot(
	snapshot: CanonicalSignInRosterSnapshot[],
	sortBy: 'alphabetical' | 'rank',
	rankCatalog?: readonly RankCatalogEntry[]
): CanonicalSignInRosterSnapshot[] {
	return sortSignInRosterRows(snapshot, sortBy, rankCatalog);
}

export function sanitizeFilterConfig(value: unknown): SignInRosterFilter | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const config = value as Record<string, unknown>;
	return {
		groups: stringArray(config.groups),
		ranks: stringArray(config.ranks),
		mos: stringArray(config.mos),
		roles: stringArray(config.roles)
	};
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return uniqueStrings(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()));
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
