import type { Personnel } from '../types';

export interface PersonnelGroup {
	group: string;
	personnel: Personnel[];
}

// Military rank order (highest to lowest)
export const RANK_ORDER = [
	'GEN', 'LTG', 'MG', 'BG', 'COL', 'LTC', 'MAJ', 'CPT', '1LT', '2LT',
	'CW5', 'CW4', 'CW3', 'CW2', 'WO1',
	'CSM', 'SGM', '1SG', 'MSG', 'SFC', 'SSG', 'SGT',
	'CPL', 'SPC', 'PFC', 'PV2', 'PV1',
	'CIV'
] as const;

// Pre-compute rank index map for O(1) lookups during sorting
const RANK_INDEX = new Map(RANK_ORDER.map((rank, index) => [rank, index]));

export interface GroupSortOptions {
	/** Groups that appear first (in order). Used for pinned groups. */
	pinnedGroups?: string[];
	/** Explicit group ordering. Groups not in list appear last alphabetically. */
	groupOrder?: string[];
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
	const opts: GroupSortOptions = Array.isArray(options)
		? { pinnedGroups: options }
		: options;

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
		people.sort((a, b) => {
			// Use pre-computed index map for O(1) rank lookup
			const rankA = RANK_INDEX.get(a.rank) ?? RANK_ORDER.length;
			const rankB = RANK_INDEX.get(b.rank) ?? RANK_ORDER.length;
			const rankDiff = rankA - rankB;
			if (rankDiff !== 0) return rankDiff;

			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;

			return a.firstName.localeCompare(b.firstName);
		});
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

	return sortedGroups.map((group) => ({
		group,
		personnel: groupMap.get(group)!
	}));
}
