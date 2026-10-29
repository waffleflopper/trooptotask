import { buildGroupTree, type Group, type GroupTree } from '$features/personnel/contracts';
import { chosenRosterGroups } from './signInRosterFilter';

export interface RosterPrintPerson {
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	/** Absent on Rosters saved before snapshots carried the Group id. */
	groupId?: string | null;
	/** The Groups above `groupId` when it was saved; absent on Rosters saved before Groups nested. */
	groupAncestors?: readonly { id: string; name: string }[];
}

/** How a printed Roster splits. `groupIds` are the top-level Groups it was drawn from; none means the whole view. */
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
	groups: readonly Group[]
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
 * Sections for each top-level Group the Roster was drawn from, or each one when it was drawn from everyone. A Group with
 * sub-groups opens into its HQ and then each sub-group's whole subtree, path-labelled. A Roster prints under the Groups
 * and the nesting saved with it, so a reprint after a rename, move or delete reads as printed; Groups it never saved keep
 * today's names and parents. People whose Group is not in either keep their saved Group name, and the ungrouped print last.
 */
function sectionsByGroup(
	snapshot: readonly RosterPrintPerson[],
	groupIds: readonly string[],
	tree: GroupTree,
	groups: readonly Group[]
): { name: string; people: readonly RosterPrintPerson[] }[] {
	const printed = buildGroupTree(savedGroups(snapshot, groups), { pinnedIds: tree.roots.map((root) => root.id) });
	const idsByName = new Map<string, string[]>();
	for (const group of groups) idsByName.set(group.name, [...(idsByName.get(group.name) ?? []), group.id]);
	const groupOf = (person: RosterPrintPerson): string | null => {
		const named = idsByName.get(person.group);
		const id = person.groupId ?? (named?.length === 1 ? named[0] : null);
		return id && printed.node(id) ? id : null;
	};

	const chosen = chosenRosterGroups({ groups: [...groupIds] }, printed);
	const sections: { name: string; people: readonly RosterPrintPerson[] }[] = [];
	const placed = new Set<RosterPrintPerson>();
	const add = (name: string, people: readonly RosterPrintPerson[]) => {
		if (people.length === 0) return;
		sections.push({ name, people });
		for (const person of people) placed.add(person);
	};
	const subtree = (id: string) => snapshot.filter((person) => printed.contains(id, groupOf(person)));

	for (const band of printed.bands(snapshot, groupOf)) {
		if (chosen.length > 0 && !chosen.includes(band.node.id)) continue;
		const label = printed.label(band.node.id);
		if (!band.node.hasChildren) {
			add(label, band.hq);
			continue;
		}
		add(`${label} HQ`, band.hq);
		for (const child of band.children) add(printed.label(child.node.id), subtree(child.node.id));
	}

	const leftovers = new Map<string, RosterPrintPerson[]>();
	for (const person of snapshot) {
		if (placed.has(person)) continue;
		const id = groupOf(person);
		const name = id ? printed.label(id) : person.group;
		leftovers.set(name, [...(leftovers.get(name) ?? []), person]);
	}
	for (const name of [...leftovers.keys()].sort((a, b) => (a && b ? a.localeCompare(b) : a ? -1 : 1))) {
		add(name || 'Unassigned', leftovers.get(name)!);
	}
	return sections;
}

/**
 * Today's catalog with every Group the Roster saved restored to its saved name and, where the snapshot carries ancestry,
 * its saved parent. The top of each saved chain was a root for the saver. Rosters saved before Groups nested restore
 * names only.
 */
function savedGroups(snapshot: readonly RosterPrintPerson[], groups: readonly Group[]): Group[] {
	const byId = new Map(groups.map((group) => [group.id, group]));
	for (const person of snapshot) {
		if (!person.groupId) continue;
		const chain = [...(person.groupAncestors ?? []), { id: person.groupId, name: person.group }];
		const known = person.groupAncestors !== undefined;
		chain.forEach((saved, index) => {
			const today = byId.get(saved.id);
			if (!today && !known) return;
			byId.set(saved.id, {
				id: saved.id,
				name: saved.name,
				sortOrder: today?.sortOrder ?? 0,
				parentId: known ? (chain[index - 1]?.id ?? null) : today!.parentId,
				depth: today?.depth ?? (Math.min(index + 1, 3) as Group['depth'])
			});
		});
	}
	return [...byId.values()];
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
