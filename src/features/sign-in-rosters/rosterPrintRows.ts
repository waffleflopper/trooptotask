export interface RosterPrintPerson {
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
}

export type RosterPrintRow =
	| { kind: 'group'; name: string }
	| { kind: 'person'; number: number; rank: string; name: string };

/** The page's rows in print order, shared by the PDF and the preview so the two cannot drift. */
export function rosterPrintRows(
	snapshot: readonly RosterPrintPerson[],
	separateByGroup: boolean,
	compareGroupNames: (a: string, b: string) => number
): RosterPrintRow[] {
	const sections = separateByGroup ? bucketByGroup(snapshot, compareGroupNames) : [{ name: '', people: snapshot }];
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

function bucketByGroup(snapshot: readonly RosterPrintPerson[], compareGroupNames: (a: string, b: string) => number) {
	const byGroup = new Map<string, RosterPrintPerson[]>();
	for (const person of snapshot) {
		const people = byGroup.get(person.group);
		if (people) people.push(person);
		else byGroup.set(person.group, [person]);
	}
	return [...byGroup.entries()]
		.sort(([a], [b]) => compareGroupNames(a, b))
		.map(([name, people]) => ({ name: name || 'Unassigned', people }));
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
