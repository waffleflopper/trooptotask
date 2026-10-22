import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { availabilityEntryLabel } from './availabilityLabels';
import { DUTY_LOOKBACK_DAYS } from './calendarRange';
import { lastDutyBefore, type DutyAvailabilityIndex, type DutyHistoryIndex, type LastDuty } from './dutyReadModel';

/** Someone or something a duty of this type may be given to, in name order. */
export type AssigneeChoice =
	| { readonly kind: 'group'; readonly id: string; readonly label: string }
	| {
			readonly kind: 'personnel';
			readonly id: string;
			readonly label: string;
			readonly prefix: string;
			readonly role: string;
			readonly mos: string;
	  };

export type DutyPickerOption =
	| { readonly kind: 'group'; readonly id: string; readonly label: string; readonly current: boolean }
	| {
			readonly kind: 'personnel';
			readonly id: string;
			readonly label: string;
			readonly prefix: string;
			readonly role: string;
			readonly mos: string;
			readonly current: boolean;
			/** Every availability entry covering the date, such as "Leave 26 Oct – 3 Nov". */
			readonly unavailable?: string;
			readonly lastDuty: LastDuty;
	  };

export interface DutyPickerInput {
	type: AssignmentType;
	dateKey: string;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	availabilityByPerson: DutyAvailabilityIndex;
	statusTypes: readonly StatusType[];
	history: DutyHistoryIndex;
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

	const exempt = new Set(type.excusals.map(({ personId }) => personId));
	return personnel
		.filter((person) => !exempt.has(person.id))
		.sort(
			(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || compareIds(a.id, b.id)
		)
		.map((person) => ({
			kind: 'personnel',
			id: person.id,
			label: `${person.lastName}, ${person.firstName}`,
			prefix: person.rank,
			role: person.clinicRole,
			mos: person.mos
		}));
}

/** Options for one slot. People who have gone longest without this duty come first. */
export function dutyPickerOptions(input: DutyPickerInput): DutyPickerOption[] {
	const choices = eligibleAssignees(input.type, input.personnel, input.groups);
	const isCurrent = (id: string) => id === input.currentAssigneeId;

	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));
	const options: DutyPickerOption[] = [];
	for (const choice of choices) {
		if (choice.kind === 'group') {
			options.push({ ...choice, current: isCurrent(choice.id) });
			continue;
		}
		const covering = input.availabilityByPerson
			.get(choice.id)
			?.filter((entry) => entry.startDate <= input.dateKey && entry.endDate >= input.dateKey)
			.map((entry) => availabilityEntryLabel(entry, statusName));
		options.push({
			...choice,
			current: isCurrent(choice.id),
			unavailable: covering?.length ? covering.join('; ') : undefined,
			lastDuty: lastDutyBefore({
				history: input.history,
				assignmentTypeId: input.type.id,
				personnelId: choice.id,
				dateKey: input.dateKey
			})
		});
	}

	// Array.sort is stable, so the name order from eligibleAssignees breaks ties.
	if (input.type.assignTo === 'personnel') options.sort((a, b) => idleDays(b) - idleDays(a));
	return options;
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

/** No duty in the window counts as longer ago than any duty inside it. */
function idleDays(option: DutyPickerOption): number {
	if (option.kind === 'group' || option.lastDuty.kind === 'none') return DUTY_LOOKBACK_DAYS + 1;
	return option.lastDuty.daysSince;
}

function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
