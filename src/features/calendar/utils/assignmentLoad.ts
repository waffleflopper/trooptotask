import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	RosterExcusalSpan
} from '$features/calendar/contracts';
import {
	comparePersonnelByRankThenName,
	type Group,
	type Personnel,
	type RankCatalogEntry
} from '$features/personnel/contracts';
import { toDayNumber } from '$lib/utils/dayNumber';
import { compilePoolRules } from '../roster/rosterPool';
import type { PersonState } from '../roster/rosterTypes';

/** How many duties from fair share still count as on share. */
export const ON_SHARE_BAND = 1;
/** How many duties over fair share a person is flagged at. */
export const OVER_FLAG = 2;
// Fair shares are sums of fractions, so a difference that is exactly a whole duty can land a hair either side of it.
// Bands read the exact difference, never the rounded one the page shows.
const EPSILON = 1e-9;

export interface AssignmentLoadInput {
	/** Everyone the reader can see. Each duty is shared among the people of this list who are eligible and present. */
	roster: readonly Personnel[];
	/** The people reported on, narrowed by the Group and MOS filters; their fair share is still worked out against `roster`. */
	shown: readonly Personnel[];
	assignments: readonly DailyAssignment[];
	assignmentTypes: readonly AssignmentType[];
	/** Every excusal that overlaps the span, reinstated ones included; a person excused on a day does not share it. */
	excusals: readonly RosterExcusalSpan[];
	/** The duty types counted; a type outside `dutyTypes(...)` is ignored. */
	typeIds: ReadonlySet<string>;
	entries: readonly AvailabilityEntry[];
	/** Only entries of these Status Types make a person away, and a person away on a day does not share that day's duty. */
	awayStatusTypeIds: ReadonlySet<string>;
	rankCatalog: readonly RankCatalogEntry[];
	groups: readonly Group[];
	startDate: string;
	endDate: string;
}

export interface TypeCount {
	assignmentTypeId: string;
	count: number;
}

export interface PersonLoad {
	person: Personnel;
	/** Duties of the counted types in the span. */
	total: number;
	/** In duty type order; a type with no duties is absent. The counts sum to `total`. */
	byType: TypeCount[];
	/** The duties the person would have drawn had each day's duty been shared evenly among those eligible and present. */
	expected: number;
	/** `total` minus `expected`, exact: positive means more than a fair share. */
	difference: number;
	/** Days of the span the person was not away. */
	presentDays: number;
	/** The date of the person's latest duty, or null. */
	lastDuty: string | null;
}

export interface DutyLoad {
	assignmentTypeId: string;
	/** Duties of this type drawn by the people reported on. */
	duties: number;
	/** People reported on who shared this duty on at least one day or drew it. */
	eligible: number;
	/** Eligible people who never drew it. */
	never: number;
	/** The eligible people by how their count of this duty compares with their fair share of it. */
	over: number;
	onShare: number;
	under: number;
}

export interface AssignmentLoadSummary {
	duties: number;
	/** People who shared at least one duty or drew one. */
	eligible: number;
	never: number;
	overFlagged: number;
	/** The people within `ON_SHARE_BAND` duties of their fair share, 0 to 1; null when nobody is eligible. */
	onShareFraction: number | null;
	onShare: number;
	/** The person furthest over fair share, or null when nobody is over it. */
	heaviest: PersonLoad | null;
	/** Of the people who drew nothing, the one owed the most. */
	owedMost: PersonLoad | null;
}

export interface AssignmentLoadReport {
	spanDays: number;
	/** The counted duty types that were assigned in the span, in catalog order. */
	dutyTypes: AssignmentType[];
	duties: DutyLoad[];
	/** The people who shared a duty or drew one, in rank then name order; order them with `rankLoad`. */
	people: PersonLoad[];
	/** Everyone reported on in rank then name order, including people with no duty and no share, for the workbook. */
	everyone: PersonLoad[];
	summary: AssignmentLoadSummary;
}

/** The person-assigned duty types worth reporting on: live ones, and archived ones still assigned in the span. */
export function dutyTypes(
	assignmentTypes: readonly AssignmentType[],
	assignments: readonly DailyAssignment[],
	startDate: string,
	endDate: string
): AssignmentType[] {
	const assigned = new Set(
		assignments.filter((a) => a.date >= startDate && a.date <= endDate).map((a) => a.assignmentTypeId)
	);
	return assignmentTypes.filter((type) => type.assignTo === 'personnel' && (!type.archivedAt || assigned.has(type.id)));
}

const stateOf = (person: Personnel): PersonState => ({
	from: '',
	active: true,
	rank: person.rank,
	mos: person.mos,
	clinicRole: person.clinicRole,
	groupId: person.groupId
});

/** Day offsets from the span start on which each person is away; a person with none is absent. */
function awayDays(
	entries: readonly AvailabilityEntry[],
	awayStatusTypeIds: ReadonlySet<string>,
	start: number,
	end: number
): Map<string, Set<number>> {
	const byPerson = new Map<string, Set<number>>();
	for (const entry of entries) {
		if (!awayStatusTypeIds.has(entry.statusTypeId)) continue;
		const first = Math.max(toDayNumber(entry.startDate), start);
		const last = Math.min(toDayNumber(entry.endDate), end);
		if (first > last) continue;
		let days = byPerson.get(entry.personnelId);
		if (!days) byPerson.set(entry.personnelId, (days = new Set()));
		for (let day = first; day <= last; day++) days.add(day - start);
	}
	return byPerson;
}

/** Expected duties per person for one duty type, summed over the days it was assigned. */
function expectedShares(
	type: AssignmentType,
	excusals: readonly RosterExcusalSpan[],
	dailyCounts: ReadonlyMap<string, number>,
	roster: readonly Personnel[],
	away: ReadonlyMap<string, Set<number>>,
	rankCatalog: readonly RankCatalogEntry[],
	groups: readonly Group[],
	start: number
): Map<string, number> {
	const matches = compilePoolRules(type.poolRules, rankCatalog, groups);
	const pool = roster.filter((person) => matches(stateOf(person)));
	const excusedBy = Map.groupBy(
		excusals.filter((excusal) => excusal.assignmentTypeId === type.id),
		(excusal) => excusal.personId
	);
	const shares = new Map<string, number>();
	for (const [date, count] of dailyCounts) {
		const offset = toDayNumber(date) - start;
		const sharing = pool.filter((person) => {
			const excused = excusedBy
				.get(person.id)
				?.some((excusal) => excusal.from <= date && (excusal.through === null || date <= excusal.through));
			return !excused && !away.get(person.id)?.has(offset);
		});
		for (const person of sharing) shares.set(person.id, (shares.get(person.id) ?? 0) + count / sharing.length);
	}
	return shares;
}

function onShare(difference: number): boolean {
	return Math.abs(difference) <= ON_SHARE_BAND + EPSILON;
}

export function computeAssignmentLoad(input: AssignmentLoadInput): AssignmentLoadReport {
	const { startDate, endDate } = input;
	const start = toDayNumber(startDate);
	const end = toDayNumber(endDate);
	const types = dutyTypes(input.assignmentTypes, input.assignments, startDate, endDate).filter((type) =>
		input.typeIds.has(type.id)
	);
	const typeIds = new Set(types.map((type) => type.id));

	const inSpan = input.assignments.filter(
		(assignment) =>
			typeIds.has(assignment.assignmentTypeId) && assignment.date >= startDate && assignment.date <= endDate
	);
	const away = awayDays(input.entries, input.awayStatusTypeIds, start, end);

	const dailyByType = new Map<string, Map<string, number>>();
	for (const assignment of inSpan) {
		let days = dailyByType.get(assignment.assignmentTypeId);
		if (!days) dailyByType.set(assignment.assignmentTypeId, (days = new Map()));
		days.set(assignment.date, (days.get(assignment.date) ?? 0) + 1);
	}
	const expectedByType = new Map(
		types.map((type) => [
			type.id,
			expectedShares(
				type,
				input.excusals,
				dailyByType.get(type.id) ?? new Map(),
				input.roster,
				away,
				input.rankCatalog,
				input.groups,
				start
			)
		])
	);

	const countsByPerson = new Map<string, Map<string, number>>();
	const lastDuty = new Map<string, string>();
	for (const assignment of inSpan) {
		let counts = countsByPerson.get(assignment.assigneeId);
		if (!counts) countsByPerson.set(assignment.assigneeId, (counts = new Map()));
		counts.set(assignment.assignmentTypeId, (counts.get(assignment.assignmentTypeId) ?? 0) + 1);
		if ((lastDuty.get(assignment.assigneeId) ?? '') < assignment.date)
			lastDuty.set(assignment.assigneeId, assignment.date);
	}

	const spanDays = end - start + 1;
	const everyone = [...input.shown].sort(comparePersonnelByRankThenName).map((person): PersonLoad => {
		const counts = countsByPerson.get(person.id);
		const byType = types.flatMap((type) => {
			const count = counts?.get(type.id) ?? 0;
			return count > 0 ? [{ assignmentTypeId: type.id, count }] : [];
		});
		const total = byType.reduce((sum, entry) => sum + entry.count, 0);
		const expected = types.reduce((sum, type) => sum + (expectedByType.get(type.id)?.get(person.id) ?? 0), 0);
		return {
			person,
			total,
			byType,
			expected,
			difference: total - expected,
			presentDays: spanDays - (away.get(person.id)?.size ?? 0),
			lastDuty: lastDuty.get(person.id) ?? null
		};
	});
	const people = everyone.filter((entry) => entry.total > 0 || entry.expected > 0);

	const duties = types
		.filter((type) => dailyByType.has(type.id))
		.map((type): DutyLoad => {
			const expected = expectedByType.get(type.id) ?? new Map<string, number>();
			const load: DutyLoad = {
				assignmentTypeId: type.id,
				duties: 0,
				eligible: 0,
				never: 0,
				over: 0,
				onShare: 0,
				under: 0
			};
			for (const entry of people) {
				const count = countsByPerson.get(entry.person.id)?.get(type.id) ?? 0;
				const share = expected.get(entry.person.id) ?? 0;
				if (count === 0 && share === 0) continue;
				const difference = count - share;
				load.duties += count;
				load.eligible++;
				if (count === 0) load.never++;
				if (onShare(difference)) load.onShare++;
				else if (difference > 0) load.over++;
				else load.under++;
			}
			return load;
		});

	return { spanDays, dutyTypes: types, duties, people, everyone, summary: summarize(people) };
}

function summarize(people: readonly PersonLoad[]): AssignmentLoadSummary {
	const best = (better: (a: PersonLoad, b: PersonLoad) => boolean, pool: readonly PersonLoad[]) =>
		pool.reduce<PersonLoad | null>((top, entry) => (top === null || better(entry, top) ? entry : top), null);
	const heaviest = best((a, b) => a.difference > b.difference, people);
	const onShareCount = people.filter((entry) => onShare(entry.difference)).length;
	const none = people.filter((entry) => entry.total === 0);
	return {
		duties: people.reduce((sum, entry) => sum + entry.total, 0),
		eligible: people.length,
		never: none.length,
		overFlagged: people.filter((entry) => entry.difference >= OVER_FLAG - EPSILON).length,
		onShareFraction: people.length > 0 ? onShareCount / people.length : null,
		onShare: onShareCount,
		heaviest: heaviest && heaviest.difference > EPSILON ? heaviest : null,
		owedMost: best((a, b) => a.expected > b.expected, none)
	};
}

export type LoadOrder = 'over' | 'under';

/** Furthest over fair share first, or furthest under; people level on the difference keep their rank then name order. */
export function rankLoad(people: readonly PersonLoad[], order: LoadOrder): PersonLoad[] {
	const sign = order === 'over' ? -1 : 1;
	return [...people].sort((a, b) => sign * (a.difference - b.difference));
}
