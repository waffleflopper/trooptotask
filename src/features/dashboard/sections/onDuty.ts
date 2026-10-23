import { assignmentSlotKey, calendarLaneTypes, indexAssignmentsBySlot } from '$features/calendar';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { availabilityRuns, backDate } from '../read-model/availabilityRuns';
import type { DashboardInputs } from './dashboardInputs';

export interface DutyRow {
	assignmentTypeId: string;
	name: string;
	color: string;
	/** Who holds the duty, or null when the day is open. */
	today: string | null;
	tomorrow: string | null;
}

/** One row per Calendar lane, in lane order, naming today's and tomorrow's assignee. */
export function tonightAndTomorrow(inputs: DashboardInputs): DutyRow[] {
	const slots = indexAssignmentsBySlot(inputs.assignments);
	const people = new Map(inputs.personnel.map((person) => [person.id, `${person.rank} ${person.lastName}`]));
	const groups = new Map(inputs.groups.map((group) => [group.id, group.name]));
	const tomorrow = fromDayNumber(toDayNumber(inputs.today) + 1);
	return calendarLaneTypes(inputs.assignmentTypes).map((type) => {
		const assigneeOn = (date: string) => {
			const assignment = slots.get(assignmentSlotKey(date, type.id));
			if (!assignment) return null;
			const names = type.assignTo === 'group' ? groups : people;
			return names.get(assignment.assigneeId) ?? 'Assigned';
		};
		return {
			assignmentTypeId: type.id,
			name: type.name,
			color: type.color,
			today: assigneeOn(inputs.today),
			tomorrow: assigneeOn(tomorrow)
		};
	});
}

export interface DutyChange {
	id: string;
	date: string;
	direction: 'leaving' | 'returning';
	personName: string;
	/** The status a Person leaves for; returns read "Returning". */
	label: string;
}

/** Departures and returns after today through `days` ahead, soonest first, at the edges of each continuous absence. */
export function comingAndGoing(inputs: DashboardInputs, days: number): DutyChange[] {
	const people = new Map(inputs.personnel.map((person) => [person.id, person]));
	const statusNames = new Map(inputs.statusTypes.map((status) => [status.id, status.name]));
	const last = fromDayNumber(toDayNumber(inputs.today) + days);
	const within = (date: string) => date > inputs.today && date <= last;
	const changes: DutyChange[] = [];
	for (const [personnelId, runs] of availabilityRuns(inputs.availability)) {
		const person = people.get(personnelId);
		if (!person) continue;
		const personName = `${person.rank} ${person.lastName}`;
		for (const run of runs) {
			if (within(run.startDate)) {
				changes.push({
					id: `${run.first.id}:leaving`,
					date: run.startDate,
					direction: 'leaving',
					personName,
					label: statusNames.get(run.first.statusTypeId) ?? 'Out'
				});
			}
			const back = backDate(run);
			if (within(back)) {
				changes.push({
					id: `${run.first.id}:returning`,
					date: back,
					direction: 'returning',
					personName,
					label: 'Returning'
				});
			}
		}
	}
	return changes.sort((a, b) => a.date.localeCompare(b.date) || a.personName.localeCompare(b.personName));
}
