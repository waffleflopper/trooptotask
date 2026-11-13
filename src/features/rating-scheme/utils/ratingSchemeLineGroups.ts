import type { PersonnelLookup } from '$features/personnel/contracts';
import { spokenPersonLabel } from './personLabel';
import type { RatingSchemeLine } from './ratingSchemeLines';

export type SchemeSort = 'seniorRaterAZ' | 'urgency';

export interface RatingSchemeLineRaterGroup {
	key: string;
	label: string;
	external: boolean;
	lines: RatingSchemeLine[];
}

export interface RatingSchemeLineSeniorRaterGroup {
	key: string;
	label: string;
	external: boolean;
	raterGroups: RatingSchemeLineRaterGroup[];
	lineCount: number;
	/** Lines with an Evaluation open on them. */
	inProgress: number;
}

const UNASSIGNED = 'unassigned';

/** Senior rater, then rater, then Rated Soldier by name. Urgency puts the group with the earliest open thru first. */
export function groupRatingSchemeLines(
	lines: readonly RatingSchemeLine[],
	personnel: readonly PersonnelLookup[],
	sort: SchemeSort
): RatingSchemeLineSeniorRaterGroup[] {
	const people = new Map(personnel.map((person) => [person.id, person]));
	const sortName = new Map<object, string>();
	const earliestOpenEnd = new Map<object, string>();
	const seniors = new Map<
		string,
		{ group: RatingSchemeLineSeniorRaterGroup; raters: Map<string, RatingSchemeLineRaterGroup> }
	>();

	const label = (personId: string | null, name: string | null): string => {
		if (!personId) return name ?? 'Not Set';
		const person = people.get(personId);
		return person ? spokenPersonLabel(person) : 'Unknown';
	};
	const nameWithoutRank = (personId: string | null, name: string | null): string => {
		const person = personId ? people.get(personId) : undefined;
		return person ? `${person.lastName}, ${person.firstName}` : label(personId, name);
	};

	for (const line of lines) {
		const seniorKey = line.seniorRaterPersonId || line.seniorRaterName || UNASSIGNED;
		let senior = seniors.get(seniorKey);
		if (!senior) {
			senior = {
				group: {
					key: seniorKey,
					label: label(line.seniorRaterPersonId, line.seniorRaterName),
					external: !line.seniorRaterPersonId && !!line.seniorRaterName,
					raterGroups: [],
					lineCount: 0,
					inProgress: 0
				},
				raters: new Map()
			};
			seniors.set(seniorKey, senior);
			sortName.set(senior.group, nameWithoutRank(line.seniorRaterPersonId, line.seniorRaterName));
		}
		const raterKey = line.raterPersonId || line.raterName || UNASSIGNED;
		let rater = senior.raters.get(raterKey);
		if (!rater) {
			rater = {
				key: raterKey,
				label: label(line.raterPersonId, line.raterName),
				external: !line.raterPersonId && !!line.raterName,
				lines: []
			};
			senior.raters.set(raterKey, rater);
			senior.group.raterGroups.push(rater);
			sortName.set(rater, nameWithoutRank(line.raterPersonId, line.raterName));
		}
		rater.lines.push(line);
		senior.group.lineCount++;
		if (line.open) {
			senior.group.inProgress++;
			for (const group of [senior.group, rater]) {
				const known = earliestOpenEnd.get(group);
				if (!known || line.open.ratingPeriodEnd < known) earliestOpenEnd.set(group, line.open.ratingPeriodEnd);
			}
		}
	}

	const compare = (
		a: RatingSchemeLineSeniorRaterGroup | RatingSchemeLineRaterGroup,
		b: RatingSchemeLineSeniorRaterGroup | RatingSchemeLineRaterGroup
	): number => {
		if (a.key === b.key) return 0;
		if (a.key === UNASSIGNED) return 1;
		if (b.key === UNASSIGNED) return -1;
		if (sort === 'urgency') {
			const aEnd = earliestOpenEnd.get(a);
			const bEnd = earliestOpenEnd.get(b);
			if (aEnd !== bEnd) return !aEnd ? 1 : !bEnd ? -1 : aEnd.localeCompare(bEnd);
		}
		return (sortName.get(a) ?? '').localeCompare(sortName.get(b) ?? '');
	};
	const ratedName = (line: RatingSchemeLine): string => {
		const person = people.get(line.ratedPersonId);
		return person ? `${person.lastName}, ${person.firstName}` : '';
	};

	const groups = [...seniors.values()].map(({ group }) => group);
	for (const senior of groups) {
		senior.raterGroups.sort(compare);
		for (const rater of senior.raterGroups) rater.lines.sort((a, b) => ratedName(a).localeCompare(ratedName(b)));
	}
	return groups.sort(compare);
}

/** The header facts of a Rating Scheme: distinct senior raters and raters on the lines, Not Set excluded. */
export function countChainRoles(lines: readonly RatingSchemeLine[]): { seniorRaters: number; raters: number } {
	const seniorRaters = new Set<string>();
	const raters = new Set<string>();
	for (const line of lines) {
		const senior = line.seniorRaterPersonId ?? line.seniorRaterName?.trim().toLowerCase();
		if (senior) seniorRaters.add(senior);
		const rater = line.raterPersonId ?? line.raterName?.trim().toLowerCase();
		if (rater) raters.add(rater);
	}
	return { seniorRaters: seniorRaters.size, raters: raters.size };
}
