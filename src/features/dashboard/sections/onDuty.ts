import {
	assignmentSlotKey,
	calendarLaneTypes,
	indexAssignmentsBySlot,
	type TaskingOnTrackRow
} from '$features/calendar';
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

export interface OnTrackTasking {
	taskingId: string;
	title: string;
	suspenseOn: string;
	href: string;
	/** The owner, then the staffing or the status. */
	detail: string;
	/** Every Person the Tasking needs is picked. */
	staffed: boolean;
}

const STATUS_WORDS = { open: 'open', in_progress: 'in progress', blocked: 'blocked' } as const;

/** On-track Taskings due within the week, in the soonest-first order the Tasking read gives them. */
export function taskingsOnTrack(inputs: DashboardInputs, onTrack: readonly TaskingOnTrackRow[]): OnTrackTasking[] {
	const groups = new Map(inputs.groups.map((group) => [group.id, group.name]));
	return onTrack.map((row) => {
		const owner =
			row.responsibleGroupId === null ? 'Organization' : (groups.get(row.responsibleGroupId) ?? 'A Group');
		const people = row.required === null ? STATUS_WORDS[row.status] : `${row.picked} / ${row.required} people`;
		return {
			taskingId: row.taskingId,
			title: row.title,
			suspenseOn: row.suspenseOn,
			href: `/org/${inputs.page.orgId}/calendar/taskings/${row.taskingId}`,
			detail: `${owner} · ${people}`,
			staffed: row.required !== null && row.picked >= row.required
		};
	});
}
