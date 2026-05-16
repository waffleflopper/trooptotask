import type { Personnel } from '$lib/types';
import { comparePersonnelByRankThenName, PERSONNEL_RANK_ORDER } from '$lib/domain/personnelRank';

export interface PersonnelGroup {
	group: string;
	personnel: Personnel[];
}

// Military rank order (highest to lowest)
export const RANK_ORDER = PERSONNEL_RANK_ORDER;

export interface GroupSortOptions {
	/** Groups that appear first (in order). Used for pinned groups. */
	pinnedGroups?: string[];
	/** Explicit group ordering. Groups not in list appear last alphabetically. */
	groupOrder?: string[];
	/** Label for ungrouped personnel when no groups are in use (e.g. org name). Defaults to 'Unassigned'. */
	fallbackGroupName?: string;
}

/**
 * Groups personnel by their group name, sorts by rank within each group,
 * and orders groups according to options.
 *
 * @param personnel - Array of personnel to group
 * @param options - Sorting options (pinnedGroups or groupOrder)
 * @returns Array of PersonnelGroup objects
 */
export function groupAndSortPersonnel(
	personnel: Personnel[],
	options: string[] | GroupSortOptions = []
): PersonnelGroup[] {
	// Support legacy signature: groupAndSortPersonnel(personnel, pinnedGroups)
	const opts: GroupSortOptions = Array.isArray(options) ? { pinnedGroups: options } : options;

	const groupMap = new Map<string, Personnel[]>();

	// Group by group name
	for (const person of personnel) {
		const group = person.groupName || '';
		if (!groupMap.has(group)) {
			groupMap.set(group, []);
		}
		groupMap.get(group)!.push(person);
	}

	// Sort each group's personnel by rank (highest first) then alphabetically
	for (const people of groupMap.values()) {
		people.sort(comparePersonnelByRankThenName);
	}

	// Sort groups based on options
	const sortedGroups = [...groupMap.keys()].sort((a, b) => {
		// Empty group always last
		if (a === '' && b !== '') return 1;
		if (a !== '' && b === '') return -1;

		// If explicit group order provided, use it
		if (opts.groupOrder) {
			const aIdx = opts.groupOrder.indexOf(a);
			const bIdx = opts.groupOrder.indexOf(b);
			if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
			if (aIdx === -1) return 1;
			if (bIdx === -1) return -1;
			return aIdx - bIdx;
		}

		// Otherwise use pinned groups logic
		const pinnedGroups = opts.pinnedGroups ?? [];
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

	// When ungrouped is the only group, use fallback name (org name) instead of empty string
	const fallback = opts.fallbackGroupName ?? 'Unassigned';
	const onlyUngrouped = sortedGroups.length === 1 && sortedGroups[0] === '';

	return sortedGroups.map((group) => ({
		group: group === '' ? (onlyUngrouped ? fallback : 'Unassigned') : group,
		personnel: groupMap.get(group)!
	}));
}
