import type { PersonnelLookup } from '$features/personnel/contracts';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { getRatingDueStatus } from './ratingScheme';

export type GroupedSort = 'urgency' | 'seniorRaterAZ';

export interface RatingSchemeRaterGroup {
	key: string;
	label: string;
	external: boolean;
	entries: RatingSchemeEntry[];
}

export interface RatingSchemeSeniorRaterGroup {
	key: string;
	label: string;
	external: boolean;
	raterGroups: RatingSchemeRaterGroup[];
	entryCount: number;
	dueCounts: { overdue: number; 'due-30': number; 'due-60': number };
}

export function groupRatingSchemeEntries(
	entries: RatingSchemeEntry[],
	personnel: PersonnelLookup[],
	sort: GroupedSort,
	today: Date = new Date()
): RatingSchemeSeniorRaterGroup[] {
	const people = new Map(personnel.map((person) => [person.id, person]));
	const seniorRaters = new Map<
		string,
		{ group: RatingSchemeSeniorRaterGroup; raters: Map<string, RatingSchemeRaterGroup> }
	>();
	const earliestOpenEnd = new Map<RatingSchemeSeniorRaterGroup | RatingSchemeRaterGroup, string>();
	const sortName = new Map<RatingSchemeSeniorRaterGroup | RatingSchemeRaterGroup, string>();

	function label(personId: string | null, name: string | null): string {
		if (!personId) return name ?? 'Not Set';
		const person = people.get(personId);
		return person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown';
	}

	function nameWithoutRank(personId: string | null, name: string | null): string {
		const person = personId ? people.get(personId) : undefined;
		return person ? `${person.lastName}, ${person.firstName}` : label(personId, name);
	}

	for (const entry of entries) {
		const seniorKey = entry.seniorRaterPersonId || entry.seniorRaterName || 'unassigned';
		let senior = seniorRaters.get(seniorKey);
		if (!senior) {
			senior = {
				group: {
					key: seniorKey,
					label: label(entry.seniorRaterPersonId, entry.seniorRaterName),
					external: !entry.seniorRaterPersonId && !!entry.seniorRaterName,
					raterGroups: [],
					entryCount: 0,
					dueCounts: { overdue: 0, 'due-30': 0, 'due-60': 0 }
				},
				raters: new Map()
			};
			seniorRaters.set(seniorKey, senior);
			sortName.set(senior.group, nameWithoutRank(entry.seniorRaterPersonId, entry.seniorRaterName));
		}
		const raterKey = entry.raterPersonId || entry.raterName || 'unassigned';
		let rater = senior.raters.get(raterKey);
		if (!rater) {
			rater = {
				key: raterKey,
				label: label(entry.raterPersonId, entry.raterName),
				external: !entry.raterPersonId && !!entry.raterName,
				entries: []
			};
			senior.raters.set(raterKey, rater);
			sortName.set(rater, nameWithoutRank(entry.raterPersonId, entry.raterName));
			senior.group.raterGroups.push(rater);
		}
		rater.entries.push(entry);
		senior.group.entryCount++;
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status, today);
		if (status === 'overdue' || status === 'due-30' || status === 'due-60') {
			senior.group.dueCounts[status]++;
		}
		if (entry.status !== 'completed') {
			for (const group of [senior.group, rater]) {
				const previous = earliestOpenEnd.get(group);
				if (!previous || entry.ratingPeriodEnd < previous) earliestOpenEnd.set(group, entry.ratingPeriodEnd);
			}
		}
	}

	function compare(
		a: RatingSchemeSeniorRaterGroup | RatingSchemeRaterGroup,
		b: RatingSchemeSeniorRaterGroup | RatingSchemeRaterGroup
	): number {
		if (a.key === b.key) return 0;
		if (a.key === 'unassigned') return 1;
		if (b.key === 'unassigned') return -1;
		if (sort === 'urgency') {
			const aEnd = earliestOpenEnd.get(a);
			const bEnd = earliestOpenEnd.get(b);
			if (aEnd !== bEnd) {
				if (!aEnd) return 1;
				if (!bEnd) return -1;
				return aEnd.localeCompare(bEnd);
			}
		}
		return (sortName.get(a) ?? '').localeCompare(sortName.get(b) ?? '');
	}

	const groups = [...seniorRaters.values()].map(({ group }) => group);
	for (const senior of groups) {
		senior.raterGroups.sort(compare);
		for (const rater of senior.raterGroups) {
			rater.entries.sort((a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd));
		}
	}
	return groups.sort(compare);
}
