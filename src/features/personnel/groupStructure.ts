import type { TreeSelectOption } from '$lib/components/patterns/tree-select';
import type { Group } from './group.types';
import type { GroupNode, GroupTree } from './groupTree';

export const MAX_GROUP_DEPTH = 3;
export const STANDARD_TEAMS = ['Alpha Team', 'Bravo Team'] as const;

/** Where a new Group goes to land last among the Groups sharing its parent (null is the top level). */
export function nextSortOrder(
	groups: readonly Pick<Group, 'parentId' | 'sortOrder'>[],
	parentId: string | null
): number {
	return Math.max(-1, ...groups.filter((group) => group.parentId === parentId).map((group) => group.sortOrder)) + 1;
}

/** What deleting one Group takes with it: the SQL command deletes the whole subtree and moves everyone in it. */
export interface GroupDeletion {
	readonly group: GroupNode;
	/** Every Group under it, depth first. */
	readonly descendants: readonly GroupNode[];
	/** The Group and every Group under it. */
	readonly ids: ReadonlySet<string>;
	/** People anywhere in the subtree. */
	readonly memberCount: number;
}

export function groupDeletion<T>(
	tree: GroupTree,
	id: string,
	people: readonly T[],
	groupOf: (person: T) => string | null
): GroupDeletion | null {
	const group = tree.node(id);
	if (!group) return null;
	const subtree = tree.ordered.filter((node) => tree.contains(id, node.id));
	const ids = new Set(subtree.map((node) => node.id));
	return {
		group,
		descendants: subtree.filter((node) => node.id !== id),
		ids,
		memberCount: people.filter((person) => ids.has(groupOf(person) ?? '')).length
	};
}

/**
 * True when the Group may move under `parentId` (null is the top level): not under itself or its own sub-groups, not
 * where it already is, and not so deep that its lowest sub-group would pass the third level.
 */
export function canMoveUnder(tree: GroupTree, id: string, parentId: string | null): boolean {
	const group = tree.node(id);
	if (!group || group.parentId === parentId) return false;
	if (parentId === null) return true;
	const parent = tree.node(parentId);
	if (!parent || tree.contains(id, parentId)) return false;
	const lowest = Math.max(...tree.ordered.filter((node) => tree.contains(id, node.id)).map((node) => node.depth));
	return parent.depth + 1 + (lowest - group.depth) <= MAX_GROUP_DEPTH;
}

export function ordinal(n: number): string {
	const tens = n % 100;
	const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
	return `${n}${suffix}`;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Makes sure "1st Squad" to "<count> Squad" exist under the platoon, each with an Alpha and a Bravo Team, creating only
 * what is missing. Running it again after a partial failure finishes the job. Resolves the Groups it created.
 */
export async function addStandardSquads(
	groups: readonly Group[],
	platoonId: string,
	count: number,
	create: (name: string, parentId: string) => Promise<Group>
): Promise<Group[]> {
	const created: Group[] = [];
	const existing = (name: string, parentId: string) =>
		groups.find((group) => group.parentId === parentId && sameName(group.name, name));
	for (let index = 1; index <= count; index++) {
		const name = `${ordinal(index)} Squad`;
		let squad = existing(name, platoonId);
		if (!squad) {
			squad = await create(name, platoonId);
			created.push(squad);
		}
		for (const team of STANDARD_TEAMS) {
			if (!existing(team, squad.id)) created.push(await create(team, squad.id));
		}
	}
	return created;
}

/** Uses an id no Group can have, since Group ids are UUIDs. */
export const UNASSIGNED_OPTION = 'unassigned';

/** A Group picker's rows: every Group the tree holds unless `include` drops it, then Unassigned when offered. */
export function groupPickerOptions(
	tree: GroupTree,
	{
		include = () => true,
		disabled,
		unassigned
	}: {
		include?: (id: string) => boolean;
		disabled?: (id: string) => boolean;
		unassigned?: string;
	} = {}
): TreeSelectOption[] {
	return [
		...tree.ordered
			.filter((node) => include(node.id))
			.map((node) => ({ id: node.id, label: node.name, depth: node.level, disabled: disabled?.(node.id) })),
		...(unassigned ? [{ id: UNASSIGNED_OPTION, label: unassigned, depth: 0, aside: true }] : [])
	];
}

/** Shows the pending order of one sibling set while its save is in flight. */
export function withPendingOrder(
	groups: readonly Group[],
	pending: { parentId: string | null; ids: readonly string[] } | null
): readonly Group[] {
	if (!pending) return groups;
	const position = new Map(pending.ids.map((id, index) => [id, index]));
	return groups.map((group) =>
		group.parentId === pending.parentId && position.has(group.id)
			? { ...group, sortOrder: position.get(group.id)! }
			: group
	);
}
