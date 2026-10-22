import {
	comparePersonnelByCatalogRankThenName,
	compareRankCodes,
	type RankCatalogEntry
} from '$features/personnel/contracts';
import { fromDayNumber, toDayNumber, type DayNumber } from '$lib/utils/dayNumber';
import { matchesFacets } from '../utils/dutyPickerFilter';
import type { EntryCause, Excusal, LeaveCause, PersonState, PoolChange, PoolRules, RosterPerson } from './rosterTypes';

type PoolFacet = 'rank' | 'mos' | 'role' | 'group';

export function compilePoolRules(
	rules: PoolRules | null,
	catalog: readonly RankCatalogEntry[]
): (state: PersonState) => boolean {
	if (!rules) return (state) => state.active;
	const selection: Record<PoolFacet, readonly string[]> = {
		rank: rules.rank ? ranksBetween(rules.rank.from, rules.rank.to, catalog) : [],
		mos: rules.mos,
		role: rules.role,
		group: rules.groupIds
	};
	return (state) =>
		state.active &&
		matchesFacets({ rank: state.rank, mos: state.mos, role: state.clinicRole, group: state.groupId ?? '' }, selection);
}

function ranksBetween(a: string, b: string, catalog: readonly RankCatalogEntry[]): string[] {
	const [high, low] = compareRankCodes(a, b, { catalog }) <= 0 ? [a, b] : [b, a];
	const inside = catalog
		.map((entry) => entry.code)
		.filter((code) => compareRankCodes(code, high, { catalog }) >= 0 && compareRankCodes(code, low, { catalog }) <= 0);
	return [...new Set([high, low, ...inside])];
}

/** Rank catalog order, highest first, then last name. The DA 6 row order and the tie-break. */
export function inDa6Order<P extends RosterPerson>(people: readonly P[], catalog: readonly RankCatalogEntry[]): P[] {
	return [...people].sort((a, b) => comparePersonnelByCatalogRankThenName(a, b, catalog));
}

export interface PoolEvent {
	readonly day: DayNumber;
	readonly change: PoolChange;
}

interface Timeline {
	stateOn(day: number): PersonState | undefined;
	excusedOn(day: number): boolean;
	breakpoints: number[];
	excusals: { from: number; through: number }[];
}

function timeline(person: RosterPerson, excusals: readonly Excusal[]): Timeline {
	const states = person.states.map((state) => ({ day: toDayNumber(state.from), state }));
	const own = excusals
		.filter((excusal) => excusal.personId === person.id)
		.map((excusal) => ({
			from: toDayNumber(excusal.from),
			through: excusal.through === null ? Infinity : toDayNumber(excusal.through)
		}));
	return {
		stateOn(day) {
			let found: PersonState | undefined;
			for (const entry of states) {
				if (entry.day > day) break;
				found = entry.state;
			}
			return found;
		},
		excusedOn: (day) => own.some((excusal) => excusal.from <= day && day <= excusal.through),
		breakpoints: [
			...states.map((entry) => entry.day),
			...own.flatMap((excusal) => [excusal.from, excusal.through + 1])
		],
		excusals: own
	};
}

function inPoolOn(line: Timeline, matches: (state: PersonState) => boolean, day: number): boolean {
	const state = line.stateOn(day);
	return state !== undefined && matches(state) && !line.excusedOn(day);
}

/**
 * Pool transitions from `from` through `through`, ascending by day, departures before entries on the same day.
 * A person is in the pool on a day when their state that day is active and matches, and no excusal covers it.
 */
export function poolEvents(input: {
	people: readonly RosterPerson[];
	excusals: readonly Excusal[];
	matches: (state: PersonState) => boolean;
	from: DayNumber;
	through: DayNumber;
}): PoolEvent[] {
	const { from, through } = input;
	const events: PoolEvent[] = [];
	for (const person of input.people) {
		const line = timeline(person, input.excusals);
		const days = [...new Set([from, ...line.breakpoints])]
			.filter((day) => day >= from && day <= through)
			.sort((a, b) => a - b) as DayNumber[];
		let member = false;
		for (const day of days) {
			if (inPoolOn(line, input.matches, day) === member) continue;
			member = !member;
			const date = fromDayNumber(day);
			events.push({
				day,
				change: member
					? { date, personId: person.id, kind: 'enter', cause: entryCause(line, day, from) }
					: { date, personId: person.id, kind: 'leave', cause: leaveCause(line, day) }
			});
		}
	}
	return events.sort((a, b) => a.day - b.day || leavesFirst(a.change) - leavesFirst(b.change));
}

function leavesFirst(change: PoolChange): number {
	return change.kind === 'leave' ? 0 : 1;
}

function entryCause(line: Timeline, day: number, formStart: number): EntryCause {
	if (day === formStart) return 'form-start';
	if (line.excusals.some((excusal) => excusal.through + 1 === day)) return 'reinstated';
	const before = line.stateOn(day - 1);
	if (!before) return 'joined';
	return before.active ? 'matched' : 'reactivated';
}

function leaveCause(line: Timeline, day: number): LeaveCause {
	if (line.excusals.some((excusal) => excusal.from === day)) return 'excused';
	return line.stateOn(day)?.active ? 'unmatched' : 'archived';
}

/** The live match count and See list: who is in the pool on `on`, in DA 6 order, and who is excused that day. */
export function poolOn(input: {
	rules: PoolRules | null;
	people: readonly RosterPerson[];
	excusals: readonly Excusal[];
	catalog: readonly RankCatalogEntry[];
	on: string;
}): { members: RosterPerson[]; excused: Excusal[] } {
	const matches = compilePoolRules(input.rules, input.catalog);
	const day = toDayNumber(input.on);
	const members = input.people.filter((person) => inPoolOn(timeline(person, input.excusals), matches, day));
	const excused = input.excusals.filter(
		(excusal) => toDayNumber(excusal.from) <= day && (excusal.through === null || day <= toDayNumber(excusal.through))
	);
	return { members: inDa6Order(members, input.catalog), excused };
}
