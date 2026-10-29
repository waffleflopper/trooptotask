import type { GroupTree } from './groupTree';

/**
 * Includes the reader's visible root, even when display labels omit a single root.
 * Legacy names containing " / " stay literal. Import must match a whole visible name first,
 * and only split the value as a path when no whole-name match exists.
 */
export function groupExportPath(groups: GroupTree, id: string | null): string {
	if (id === null) return '';
	return groups.ordered
		.filter((group) => groups.contains(group.id, id))
		.map((group) => group.name)
		.join(' / ');
}
