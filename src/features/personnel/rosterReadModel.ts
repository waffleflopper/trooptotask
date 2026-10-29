import type { ScopeSet } from '$lib/access/memberAccessShape';
import { comparePersonnelByRankThenName } from './personnelRank';
import type { Personnel } from './personnel.types';

export interface PersonnelGroup {
	/** `null` is the ungrouped band. */
	groupId: string | null;
	group: string;
	personnel: Personnel[];
}

export interface RosterGroupFilterOption {
	value: string;
	label: string;
	count: number;
}

export type RosterScopeSelection = { scope: 'full' } | { scope: 'scope-set'; scopeSet: ScopeSet };
export type RosterStatus = 'active' | 'archived' | 'all';

export interface RosterGroupCatalogEntry {
	id: string;
	name: string;
	sortOrder: number;
}

export interface RosterGroupOrder {
	groups: readonly RosterGroupCatalogEntry[];
	pinnedGroupIds: readonly string[];
}

/** A roster band: a Group by id, or the ungrouped band (`groupId` null, empty name). */
export interface RosterBand {
	groupId: string | null;
	name: string;
}

export interface CreateRosterReadModelInput extends RosterGroupOrder {
	personnel: Personnel[];
	fallbackGroupName?: string;
}

export interface RosterViewOptions {
	status?: RosterStatus;
	groupId?: string | null;
	groupFilter?: string;
	search?: string;
}

export interface RosterReadModelView {
	personnel: Personnel[];
	personnelByGroup: PersonnelGroup[];
	flatPersonnel: Personnel[];
	groupFilterOptions: RosterGroupFilterOption[];
	personnelById: Map<string, Personnel>;
	getById: (personnelId: string) => Personnel | undefined;
	displayName: (personnelId: string, fallback?: string) => string;
	groupName: (personnelId: string) => string | null;
}

export interface RosterReadModel {
	full: (options?: RosterViewOptions) => RosterReadModelView;
	scoped: (scopeSet: ScopeSet, options?: RosterViewOptions) => RosterReadModelView;
	view: (scope: RosterScopeSelection, options?: RosterViewOptions) => RosterReadModelView;
}

export function createRosterReadModel(input: CreateRosterReadModelInput): RosterReadModel {
	function view(scope: RosterScopeSelection, options: RosterViewOptions = {}): RosterReadModelView {
		const scopedPersonnel = applyScope(input.personnel, scope);
		const selectedPersonnel = applyRosterOptions(scopedPersonnel, options);
		const baseGroups = groupRosterPersonnel(selectedPersonnel, input);
		const filteredGroups = applyGroupFilter(baseGroups, options.groupFilter);
		const searchedGroups = applyRosterSearch(filteredGroups, options.search);
		const flatPersonnel = searchedGroups.flatMap((group) => group.personnel);
		const personnelById = new Map(flatPersonnel.map((person) => [person.id, person]));

		return {
			personnel: flatPersonnel,
			personnelByGroup: searchedGroups,
			flatPersonnel,
			groupFilterOptions: buildRosterGroupFilterOptions(baseGroups),
			personnelById,
			getById(personnelId) {
				return personnelById.get(personnelId);
			},
			displayName(personnelId, fallback = 'Unknown') {
				return formatRosterPersonDisplayName(personnelById.get(personnelId), fallback);
			},
			groupName(personnelId) {
				return personnelById.get(personnelId)?.groupName || null;
			}
		};
	}

	return {
		full(options) {
			return view({ scope: 'full' }, options);
		},
		scoped(scopeSet, options) {
			return view({ scope: 'scope-set', scopeSet }, options);
		},
		view
	};
}

export function rosterGroupFilterValue(group: PersonnelGroup): string {
	return group.groupId ?? `name:${group.group}`;
}

export function matchesRosterSearch(person: Personnel, groupName: string, query: string): boolean {
	const normalizedQuery = normalizeRosterSearchTerm(query);
	if (!normalizedQuery) return true;

	const searchableValues = [
		person.rank,
		person.mos,
		person.clinicRole,
		person.groupName,
		groupName,
		person.firstName,
		person.lastName,
		`${person.firstName} ${person.lastName}`,
		`${person.lastName}, ${person.firstName}`
	];

	return searchableValues.some((value) => normalizeRosterSearchTerm(value).includes(normalizedQuery));
}

export function formatRosterPersonDisplayName(person: Personnel | undefined, fallback = 'Unknown'): string {
	return person ? `${person.rank} ${person.lastName}, ${person.firstName}` : fallback;
}

function applyScope(personnel: Personnel[], scope: RosterScopeSelection): Personnel[] {
	if (scope.scope === 'full' || scope.scopeSet.kind === 'organization') return personnel;
	const groupScopeIds = new Set(scope.scopeSet.groupIds);
	return personnel.filter((person) => person.groupId !== null && groupScopeIds.has(person.groupId));
}

function applyRosterOptions(personnel: Personnel[], options: RosterViewOptions): Personnel[] {
	const status = options.status ?? 'all';

	return personnel.filter((person) => {
		if (status === 'active' && person.archivedAt) return false;
		if (status === 'archived' && !person.archivedAt) return false;
		if (options.groupId && person.groupId !== options.groupId) return false;
		return true;
	});
}

function applyGroupFilter(groups: PersonnelGroup[], groupFilter: string | undefined): PersonnelGroup[] {
	if (!groupFilter) return groups;
	return groups.filter((group) => rosterGroupFilterValue(group) === groupFilter);
}

function applyRosterSearch(groups: PersonnelGroup[], search: string | undefined): PersonnelGroup[] {
	if (!search?.trim()) return groups;

	return groups
		.map((group) => ({
			...group,
			personnel: group.personnel.filter((person) => matchesRosterSearch(person, group.group, search))
		}))
		.filter((group) => group.personnel.length > 0);
}

function buildRosterGroupFilterOptions(groups: PersonnelGroup[]): RosterGroupFilterOption[] {
	const total = groups.reduce((sum, group) => sum + group.personnel.length, 0);

	return [
		{ value: '', label: 'All groups', count: total },
		...groups.map((group) => ({
			value: rosterGroupFilterValue(group),
			label: group.group,
			count: group.personnel.length
		}))
	];
}

function normalizeRosterSearchTerm(value: string | null | undefined): string {
	return value?.trim().toLowerCase() ?? '';
}

/** The Organization's Group order: `sortOrder`, then name, then id. */
export function organizationGroupOrder<T extends RosterGroupCatalogEntry>(groups: readonly T[]): T[] {
	return [...groups].sort(
		(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
	);
}

/**
 * Pinned Groups first in pin order, then the Organization's Group order, then bands outside the catalog by name,
 * then the ungrouped band.
 */
export function compareRosterBands({
	groups,
	pinnedGroupIds
}: RosterGroupOrder): (a: RosterBand, b: RosterBand) => number {
	const groupOrder = new Map(organizationGroupOrder(groups).map((group, index) => [group.id, index]));
	const pinOrder = new Map(pinnedGroupIds.map((id, index) => [id, index]));
	const ungrouped = (band: RosterBand) => band.groupId === null && band.name === '';
	const rank = (order: Map<string, number>, band: RosterBand) =>
		band.groupId === null ? undefined : order.get(band.groupId);
	return (a, b) => {
		if (ungrouped(a) || ungrouped(b)) return ungrouped(a) === ungrouped(b) ? 0 : ungrouped(a) ? 1 : -1;

		const aPin = rank(pinOrder, a);
		const bPin = rank(pinOrder, b);
		if (aPin !== undefined || bPin !== undefined) {
			if (aPin === undefined) return 1;
			if (bPin === undefined) return -1;
			return aPin - bPin;
		}

		const aIdx = rank(groupOrder, a);
		const bIdx = rank(groupOrder, b);
		if (aIdx === undefined && bIdx === undefined) return a.name.localeCompare(b.name);
		if (aIdx === undefined) return 1;
		if (bIdx === undefined) return -1;
		return aIdx - bIdx;
	};
}

function groupRosterPersonnel(
	personnel: Personnel[],
	options: RosterGroupOrder & { fallbackGroupName?: string }
): PersonnelGroup[] {
	const bands = new Map<string, { band: RosterBand; personnel: Personnel[] }>();

	for (const person of personnel) {
		const key = person.groupId ?? '';
		let entry = bands.get(key);
		if (!entry) {
			entry = { band: { groupId: person.groupId, name: person.groupId ? person.groupName : '' }, personnel: [] };
			bands.set(key, entry);
		}
		entry.personnel.push(person);
	}

	for (const entry of bands.values()) {
		entry.personnel.sort(comparePersonnelByRankThenName);
	}

	const compare = compareRosterBands(options);
	const sorted = [...bands.values()].sort((a, b) => compare(a.band, b.band));

	const fallback = options.fallbackGroupName ?? 'Unassigned';
	const onlyUngrouped = sorted.length === 1 && sorted[0].band.groupId === null;

	return sorted.map(({ band, personnel }) => ({
		groupId: band.groupId,
		group: band.groupId === null ? (onlyUngrouped ? fallback : 'Unassigned') : band.name,
		personnel
	}));
}
