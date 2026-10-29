import type { RosterBand } from '$features/personnel/contracts';

export interface RosterPrintPerson {
	rank: string;
	lastName: string;
	firstName: string;
	group: string;
	/** Absent on Rosters saved before snapshots carried the Group id. */
	groupId?: string | null;
}

export type CompareRosterBands = (a: RosterBand, b: RosterBand) => number;

export type RosterPrintRow =
	| { kind: 'group'; name: string }
	| { kind: 'person'; number: number; rank: string; name: string };

/** The page's rows in print order, shared by the PDF and the preview so the two cannot drift. */
export function rosterPrintRows(
	snapshot: readonly RosterPrintPerson[],
	separateByGroup: boolean,
	compareBands: CompareRosterBands
): RosterPrintRow[] {
	const sections = separateByGroup ? bucketByGroup(snapshot, compareBands) : [{ name: '', people: snapshot }];
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

function bucketByGroup(snapshot: readonly RosterPrintPerson[], compareBands: CompareRosterBands) {
	const byGroup = new Map<string, { band: RosterBand; people: RosterPrintPerson[] }>();
	for (const person of snapshot) {
		const groupId = person.groupId ?? null;
		const key = groupId ?? `name:${person.group}`;
		const section = byGroup.get(key);
		if (section) section.people.push(person);
		else byGroup.set(key, { band: { groupId, name: person.group }, people: [person] });
	}
	return [...byGroup.values()]
		.sort((a, b) => compareBands(a.band, b.band))
		.map(({ band, people }) => ({ name: band.name || 'Unassigned', people }));
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
