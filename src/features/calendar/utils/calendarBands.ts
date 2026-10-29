import type { Band, GroupFocus, GroupTree, Personnel, PersonnelGroup } from '$features/personnel/contracts';

export interface CalendarBand extends PersonnelGroup {
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
 * The sections of the reader's roster that the focus shows, in tree order: each Group's own people, then its
 * sub-groups. People whose Group is outside the tree, and Unassigned, keep the sections' order after them.
 */
export function nestCalendarBands(
	tree: GroupTree,
	focus: GroupFocus | null,
	sections: readonly PersonnelGroup[]
): CalendarBand[] {
	if (!focus) return [];
	const people = sections.flatMap((section) => section.personnel);
	const base = focus.kind === 'group' ? (tree.node(focus.id)?.level ?? 0) : 0;
	const out: CalendarBand[] = [];
	const visit = (band: Band<Personnel>): Personnel[] => {
		const { node } = band;
		const label = tree.label(node.id);
		const level = node.level - base;
		const entry: CalendarBand = {
			groupId: node.id,
			group: label,
			name: level === 0 ? label : node.name,
			personnel: [...band.hq],
			level,
			people: [],
			pinnable: node.parentId === null
		};
		out.push(entry);
		entry.people = [...band.hq, ...band.children.flatMap(visit)];
		return entry.people;
	};
	tree.bands(focus, people, groupOf).forEach(visit);

	const shown = new Set(tree.within(focus, people, groupOf));
	for (const section of sections) {
		if (section.groupId !== null && tree.node(section.groupId)) continue;
		const personnel = section.personnel.filter((person) => shown.has(person));
		if (personnel.length === 0) continue;
		out.push({
			...section,
			personnel,
			level: 0,
			name: section.group,
			people: personnel,
			pinnable: section.groupId !== null
		});
	}
	return out;
}
