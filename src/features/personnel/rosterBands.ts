import type { Band, GroupTree } from './groupTree';
import { comparePersonnelByRankThenName } from './personnelRank';
import type { Personnel } from './personnel.types';
import type { PersonnelGroup } from './rosterReadModel';

export interface NestedRosterBand extends PersonnelGroup {
	/** 0 for a top band, then 1 and 2 for the sub-groups below it. */
	level: number;
	/** The Group's own name; `group` is its full path, which flat views and exports print. */
	name: string;
	/** Everyone in the band's Group and its sub-groups. */
	people: Personnel[];
	/** Only top-level Groups can be pinned. */
	pinnable: boolean;
}

const groupOf = (person: Personnel) => person.groupId;

/**
 * The reader's roster sections in tree order: each Group's own people, then its sub-groups. Not `nested`, each root is
 * one band of its whole subtree by rank and name. People whose Group is outside the tree, and Unassigned, keep the
 * sections' order after them.
 */
export function nestRosterBands(
	tree: GroupTree,
	sections: readonly PersonnelGroup[],
	nested = true
): NestedRosterBand[] {
	const people = sections.flatMap((section) => section.personnel);
	if (!nested) people.sort(comparePersonnelByRankThenName);
	const out: NestedRosterBand[] = [];
	const visit = (band: Band<Personnel>): Personnel[] => {
		const { node } = band;
		const label = tree.label(node.id);
		const entry: NestedRosterBand = {
			groupId: node.id,
			group: label,
			name: node.level === 0 ? label : node.name,
			personnel: [...band.hq],
			level: node.level,
			people: [],
			pinnable: node.parentId === null
		};
		out.push(entry);
		entry.people = [...band.hq, ...band.children.flatMap(visit)];
		return entry.people;
	};
	tree.bands(people, groupOf, { nested }).forEach(visit);

	for (const section of sections) {
		if (section.groupId !== null && tree.node(section.groupId)) continue;
		out.push({
			...section,
			level: 0,
			name: section.group,
			people: section.personnel,
			pinnable: section.groupId !== null
		});
	}
	return out;
}
