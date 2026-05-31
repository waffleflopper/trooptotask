import type { ScopeSet } from '$lib/access/memberAccessShape';
import { comparePersonnelByRankThenName } from '$lib/domain/personnelRank';
import type { Personnel } from '$lib/types';

export interface PersonnelGroup {
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

export interface CreateRosterReadModelInput {
	personnel: Personnel[];
	pinnedGroups?: string[];
	groupOrder?: string[];
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
		const baseGroups = groupRosterPersonnel(selectedPersonnel, {
			pinnedGroups: input.pinnedGroups,
			groupOrder: input.groupOrder,
			fallbackGroupName: input.fallbackGroupName
		});
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
	return group.personnel.find((person) => person.groupId)?.groupId ?? `name:${group.group}`;
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
	const scopedGroupIds = new Set(scope.scopeSet.groupIds);
	return personnel.filter((person) => person.groupId !== null && scopedGroupIds.has(person.groupId));
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

interface GroupRosterOptions {
	pinnedGroups?: string[];
	groupOrder?: string[];
	fallbackGroupName?: string;
}

function groupRosterPersonnel(personnel: Personnel[], options: GroupRosterOptions = {}): PersonnelGroup[] {
	const groupMap = new Map<string, Personnel[]>();

	for (const person of personnel) {
		const group = person.groupName || '';
		if (!groupMap.has(group)) {
			groupMap.set(group, []);
		}
		groupMap.get(group)!.push(person);
	}

	for (const people of groupMap.values()) {
		people.sort(comparePersonnelByRankThenName);
	}

	const sortedGroups = [...groupMap.keys()].sort((a, b) => {
		if (a === '' && b !== '') return 1;
		if (a !== '' && b === '') return -1;

		if (options.groupOrder) {
			const aIdx = options.groupOrder.indexOf(a);
			const bIdx = options.groupOrder.indexOf(b);
			if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
			if (aIdx === -1) return 1;
			if (bIdx === -1) return -1;
			return aIdx - bIdx;
		}

		const pinnedGroups = options.pinnedGroups ?? [];
		const pinnedSet = new Set(pinnedGroups);
		const aPinned = pinnedSet.has(a);
		const bPinned = pinnedSet.has(b);

		if (aPinned && bPinned) {
			return pinnedGroups.indexOf(a) - pinnedGroups.indexOf(b);
		}
		if (aPinned && !bPinned) return -1;
		if (!aPinned && bPinned) return 1;

		return a.localeCompare(b);
	});

	const fallback = options.fallbackGroupName ?? 'Unassigned';
	const onlyUngrouped = sortedGroups.length === 1 && sortedGroups[0] === '';

	return sortedGroups.map((group) => ({
		group: group === '' ? (onlyUngrouped ? fallback : 'Unassigned') : group,
		personnel: groupMap.get(group)!
	}));
}
