import type { AssignmentType, RosterDay, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { availabilityEntryLabel } from './availabilityLabels';
import type { DutyAvailabilityIndex } from './dutyReadModel';
import { effectLabel } from './plannerRosters';

/** Someone or something a duty of this type may be given to, in name order. */
export type AssigneeChoice =
	| { readonly kind: 'group'; readonly id: string; readonly label: string }
	| { readonly kind: 'personnel'; readonly id: string; readonly label: string; readonly prefix: string };

export type DutyPickerOption =
	| { readonly kind: 'group'; readonly id: string; readonly label: string; readonly current: boolean }
	| {
			readonly kind: 'personnel';
			readonly id: string;
			readonly label: string;
			readonly prefix: string;
			readonly current: boolean;
			/** Roster code and reason, such as "Leave (A)", or without roster counts every availability entry covering the date. */
			readonly unavailable?: string;
			/** The roster count going into the date. Absent without roster counts. */
			readonly count?: number;
			/** Outside the roster's pool, so offered only to a name search. */
			readonly offRoster: boolean;
	  };

export interface DutyPickerInput {
	type: AssignmentType;
	dateKey: string;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	availabilityByPerson: DutyAvailabilityIndex;
	statusTypes: readonly StatusType[];
	/** The roster on the date, when the operator can see roster counts. */
	roster?: RosterDay;
	currentAssigneeId?: string;
}

/** A Group type offers every Group. A person type offers everyone it does not excuse. */
export function eligibleAssignees(
	type: AssignmentType,
	personnel: readonly Personnel[],
	groups: readonly Group[]
): AssigneeChoice[] {
	if (type.assignTo === 'group') {
		return [...groups]
			.sort((a, b) => a.name.localeCompare(b.name) || compareIds(a.id, b.id))
			.map((group) => ({ kind: 'group', id: group.id, label: group.name }));
	}
	return notExcused(type, personnel).map(personChoice);
}

/**
 * Options for one slot. With a roster, the pool comes first and everyone else follows as off the roster. On a detail
 * day the pool is in roster order with counts, highest first and ties in DA 6 order; on any other day it is in DA 6
 * order without counts. Without a roster, people are in name order.
 */
export function dutyPickerOptions(input: DutyPickerInput): DutyPickerOption[] {
	const isCurrent = (id: string) => id === input.currentAssigneeId;
	if (input.type.assignTo === 'group') {
		return eligibleAssignees(input.type, input.personnel, input.groups).flatMap((choice) =>
			choice.kind === 'group' ? [{ ...choice, current: isCurrent(choice.id) }] : []
		);
	}

	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));
	const covering = (personId: string) => {
		const labels = input.availabilityByPerson
			.get(personId)
			?.filter((entry) => entry.startDate <= input.dateKey && entry.endDate >= input.dateKey)
			.map((entry) => availabilityEntryLabel(entry, statusName));
		return labels?.length ? labels.join('; ') : undefined;
	};

	const roster = input.roster;
	if (!roster) {
		return notExcused(input.type, input.personnel).map((person) => ({
			...personChoice(person),
			current: isCurrent(person.id),
			unavailable: covering(person.id),
			offRoster: false
		}));
	}

	const personById = new Map(input.personnel.map((person) => [person.id, person]));
	const entries =
		roster.track === null
			? roster.pool.map((personId) => ({ personId, count: undefined, unavailable: covering(personId) }))
			: roster.standing.map(({ personId, count, effect }) => ({
					personId,
					count,
					unavailable: effect ? effectLabel(effect) : undefined
				}));
	const pool: DutyPickerOption[] = entries.flatMap(({ personId, count, unavailable }) => {
		const person = personById.get(personId);
		if (!person) return [];
		return [{ ...personChoice(person), current: isCurrent(person.id), unavailable, count, offRoster: false }];
	});
	const inPool = new Set(entries.map((entry) => entry.personId));
	const others = notExcused(
		input.type,
		input.personnel.filter((person) => !inPool.has(person.id))
	).map(
		(person): DutyPickerOption => ({
			...personChoice(person),
			current: isCurrent(person.id),
			unavailable: covering(person.id),
			offRoster: true
		})
	);
	return [...pool, ...others];
}

/**
 * The picker's Command filter: 1 when every typed word appears in the option's text, else 0.
 * Words match in any order, so "ortiz spc" finds the same person as "spc ortiz".
 */
export function dutySearchScore(_value: string, search: string, keywords: readonly string[] = []): 1 | 0 {
	const haystack = keywords.join(' ').toLowerCase();
	return search
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word))
		? 1
		: 0;
}

function notExcused(type: AssignmentType, personnel: readonly Personnel[]): Personnel[] {
	const excused = new Set(type.excusals.map(({ personId }) => personId));
	return byName(personnel.filter((person) => !excused.has(person.id)));
}

function byName(personnel: readonly Personnel[]): Personnel[] {
	return [...personnel].sort(
		(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || compareIds(a.id, b.id)
	);
}

function personChoice(person: Personnel): Extract<AssigneeChoice, { kind: 'personnel' }> {
	return { kind: 'personnel', id: person.id, label: `${person.lastName}, ${person.firstName}`, prefix: person.rank };
}

function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
