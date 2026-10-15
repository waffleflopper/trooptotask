import type { AssignmentType, AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { parseDate } from '$lib/utils/dates';

export interface DutyPickerOption {
	readonly id: string;
	readonly label: string;
	readonly prefix?: string;
	/** Every availability entry covering the date, such as "Leave 26 Oct – 3 Nov". */
	readonly unavailable?: string;
	readonly current: boolean;
}

export interface DutyPickerInput {
	type: AssignmentType;
	dateKey: string;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	availabilityEntries: readonly AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	currentAssigneeId?: string;
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export function dutyPickerOptions(input: DutyPickerInput): DutyPickerOption[] {
	if (input.type.assignTo === 'group') {
		return [...input.groups]
			.sort((a, b) => a.name.localeCompare(b.name) || compareIds(a.id, b.id))
			.map((group) => ({ id: group.id, label: group.name, current: group.id === input.currentAssigneeId }));
	}

	const exempt = new Set(input.type.exemptPersonnelIds);
	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));
	const covering = new Map<string, string[]>();
	for (const entry of input.availabilityEntries) {
		if (entry.startDate > input.dateKey || entry.endDate < input.dateKey) continue;
		const text = `${statusName.get(entry.statusTypeId) ?? 'Unavailable'} ${dateRange(entry.startDate, entry.endDate)}`;
		covering.set(entry.personnelId, [...(covering.get(entry.personnelId) ?? []), text]);
	}

	return input.personnel
		.filter((person) => !exempt.has(person.id))
		.sort(
			(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || compareIds(a.id, b.id)
		)
		.map((person) => ({
			id: person.id,
			label: `${person.lastName}, ${person.firstName}`,
			prefix: person.rank,
			unavailable: covering.get(person.id)?.join('; '),
			current: person.id === input.currentAssigneeId
		}));
}

function dateRange(start: string, end: string): string {
	const from = SHORT_DATE.format(parseDate(start));
	return start === end ? from : `${from} – ${SHORT_DATE.format(parseDate(end))}`;
}

function compareIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
