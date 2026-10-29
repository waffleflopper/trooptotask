import type { Group, GroupTree } from '$features/personnel/contracts';

export interface RosterPrintPerson {
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	/** Absent on Rosters saved before snapshots carried the Group id. */
	groupId?: string | null;
}

export type RosterPrintGroup = Pick<Group, 'id' | 'name'>;

/** How a printed Roster splits. `groupIds` are the Groups it was drawn from; none means the whole view. */
export type RosterSplit = { separateByGroup: false } | { separateByGroup: true; groupIds: readonly string[] };

/** A saved Roster splits by the Groups its filter chose; an old filter without them splits like the whole view. */
export function rosterSplit(roster: {
	separateByGroup: boolean;
	filterConfig: { groups?: readonly string[] } | null;
}): RosterSplit {
	return roster.separateByGroup
		? { separateByGroup: true, groupIds: roster.filterConfig?.groups ?? [] }
		: { separateByGroup: false };
}

export type RosterPrintRow =
	| { kind: 'group'; name: string }
	| { kind: 'person'; number: number; rank: string; name: string };

/** The page's rows in print order, shared by the PDF and the preview so the two cannot drift. */
export function rosterPrintRows(
	snapshot: readonly RosterPrintPerson[],
	split: RosterSplit,
	tree: GroupTree,
	groups: readonly RosterPrintGroup[]
): RosterPrintRow[] {
	const sections = split.separateByGroup
		? sectionsByGroup(snapshot, split.groupIds, tree, groups)
		: [{ name: '', people: snapshot }];
	const rows: RosterPrintRow[] = [];
	let number = 0;
	for (const section of sections) {
		if (section.name) rows.push({ kind: 'group', name: section.name });
		for (const person of section.people) {
			number++;
			rows.push({ kind: 'person', number, rank: person.rank, name: `${person.lastName}, ${person.firstName}` });
		}
	}
	return rows;
}

/**
 * Sections for each Group the Roster was drawn from, or each top-level Group when it was drawn from everyone. A Group
 * with sub-groups opens into its HQ and then each sub-group's whole subtree, path-labelled. People whose Group is no
 * longer in the tree keep their saved Group name, and the ungrouped print last.
 */
function sectionsByGroup(
	snapshot: readonly RosterPrintPerson[],
	groupIds: readonly string[],
	tree: GroupTree,
	groups: readonly RosterPrintGroup[]
): { name: string; people: readonly RosterPrintPerson[] }[] {
	const idsByName = new Map<string, string[]>();
	for (const group of groups) idsByName.set(group.name, [...(idsByName.get(group.name) ?? []), group.id]);
	const groupOf = (person: RosterPrintPerson): string | null => {
		const named = idsByName.get(person.group);
		const id = person.groupId ?? (named?.length === 1 ? named[0] : null);
		return id && tree.node(id) ? id : null;
	};

	const chosen = tree.canonicalRoots(groupIds.filter((id) => tree.node(id)));
	const tops = new Set(chosen.length > 0 ? chosen : tree.roots.map((root) => root.id));
	const sections: { name: string; people: readonly RosterPrintPerson[] }[] = [];
	const placed = new Set<RosterPrintPerson>();
	const add = (name: string, people: readonly RosterPrintPerson[]) => {
		if (people.length === 0) return;
		sections.push({ name, people });
		for (const person of people) placed.add(person);
	};

	for (const id of tree.ordered.map((node) => node.id).filter((node) => tops.has(node))) {
		const rows = tree.breakdown({ kind: 'group', id }, snapshot, groupOf).rows;
		if (rows.length === 0) add(tree.label(id), tree.within({ kind: 'group', id }, snapshot, groupOf));
		for (const row of rows) add(row.kind === 'hq' ? `${tree.label(id)} HQ` : tree.label(row.key), row.items);
	}

	const leftovers = new Map<string, RosterPrintPerson[]>();
	for (const person of snapshot) {
		if (placed.has(person)) continue;
		const id = groupOf(person);
		const name = id ? tree.label(id) : person.group;
		leftovers.set(name, [...(leftovers.get(name) ?? []), person]);
	}
	for (const name of [...leftovers.keys()].sort((a, b) => (a && b ? a.localeCompare(b) : a ? -1 : 1))) {
		add(name || 'Unassigned', leftovers.get(name)!);
	}
	return sections;
}

export function rosterDateLine(rosterDate: string | null, blankDate: boolean): string {
	if (blankDate || !rosterDate) return 'Date: _______________';
	const formatted = new Date(`${rosterDate}T00:00:00`).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	return `Date: ${formatted}`;
}
