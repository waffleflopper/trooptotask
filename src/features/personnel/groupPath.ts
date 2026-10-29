import type { GroupTree } from './groupTree';

export const GROUP_PATH_SEPARATOR = ' / ';

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
		.join(GROUP_PATH_SEPARATOR);
}

export type GroupPathMatch =
	| { kind: 'found'; id: string }
	/** Two or more Groups answer to the value, such as "Alpha Team" under two squads. */
	| { kind: 'ambiguous'; ids: readonly string[] }
	| { kind: 'missing' };

/**
 * Reads a Group value the way `groupExportPath` writes it. A whole visible name wins, so a legacy name containing
 * " / " still matches itself; only when no name matches is the value split and walked down from the reader's roots.
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
	if (named.length > 0 || !text.includes(GROUP_PATH_SEPARATOR)) return answer(named.map((group) => group.id));
	let level: readonly { id: string; name: string }[] = groups.roots;
	let matched: string[] = [];
	for (const step of text.split(GROUP_PATH_SEPARATOR).map(normalize)) {
		matched = level.filter((group) => normalize(group.name) === step).map((group) => group.id);
		level = groups.ordered.filter((group) => group.parentId !== null && matched.includes(group.parentId));
	}
	return answer(matched);
}
