import type { GroupTree } from './groupTree';

export const GROUP_PATH_SEPARATOR = ' / ';

/**
 * Includes the reader's visible root, even when display labels omit a single root.
 * Legacy names containing " / " stay literal. Import must match a whole visible name first,
 * then match the full export path so separators inside a name remain literal.
 */
export function groupExportPath(groups: GroupTree, id: string | null): string {
	if (id === null) return '';
	return groups.ordered
		.filter((group) => groups.contains(group.id, id))
		.map((group) => group.name)
		.join(GROUP_PATH_SEPARATOR);
}

export type GroupPathMatch =
	| { kind: 'found'; id: string }
	/** Two or more Groups answer to the value, such as "Alpha Team" under two squads. */
	| { kind: 'ambiguous'; ids: readonly string[] }
	| { kind: 'missing' };

/**
 * Reads a Group value the way `groupExportPath` writes it. A whole visible name wins, so a legacy name containing
 * " / " still matches itself. Otherwise every visible Group's export path participates, including legacy names.
 */
export function resolveGroupPath(
	groups: GroupTree,
	text: string,
	normalize: (value: string) => string = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase()
): GroupPathMatch {
	const wanted = normalize(text);
	const named = groups.ordered.filter((group) => normalize(group.name) === wanted);
	const answer = (ids: readonly string[]): GroupPathMatch =>
		ids.length === 1
			? { kind: 'found', id: ids[0] }
			: ids.length > 1
				? { kind: 'ambiguous', ids }
				: { kind: 'missing' };
	if (named.length > 0) return answer(named.map((group) => group.id));
	return answer(
		groups.ordered.filter((group) => normalize(groupExportPath(groups, group.id)) === wanted).map((group) => group.id)
	);
}
