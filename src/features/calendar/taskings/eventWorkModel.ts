import { z } from 'zod';
import type { EventDates } from '../events/eventModel';
import { isActiveStatus, type Tasking, type TaskingExecution, type TaskingStatusKind } from './taskingModel';

export type EventWorkPhase = 'preparation' | 'execution' | 'closeout';

export const EVENT_WORK_PHASES: readonly EventWorkPhase[] = ['preparation', 'execution', 'closeout'];

export interface EventWorkDates {
	suspenseOn: string;
	execution: Pick<TaskingExecution, 'startsOn' | 'endsOn'> | null;
}

/**
 * Where a Tasking sits against its Event. Execution when its commitment or its suspense touches the
 * Event's dates; otherwise preparation when it is due before the Event starts, closeout when after it ends.
 */
export function eventWorkPhase(work: EventWorkDates, event: EventDates): EventWorkPhase {
	const touches =
		(work.suspenseOn >= event.startsOn && work.suspenseOn <= event.endsOn) ||
		(work.execution !== null && work.execution.startsOn <= event.endsOn && work.execution.endsOn >= event.startsOn);
	if (touches) return 'execution';
	return work.suspenseOn < event.startsOn ? 'preparation' : 'closeout';
}

/** Another Group's or the Organization's Tasking under a shared Event, as the one-line row a reader outside it gets. */
export type SummaryResponsibility = { kind: 'organization' } | { kind: 'group'; name: string };

export interface TaskingSummary extends EventWorkDates {
	id: string;
	title: string;
	responsibility: SummaryResponsibility;
	status: TaskingStatusKind;
	/** People required. Picked people are not counted until staffing exists. */
	requiredCount: number | null;
	pickedCount: number;
}

export const taskingSummaryRowSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		responsible_group_name: z.string().nullable(),
		status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']),
		staffing_required: z.number().nullable(),
		staffing_picked: z.number(),
		suspense_on: z.string(),
		execution_starts_on: z.string().nullable(),
		execution_ends_on: z.string().nullable()
	})
	.strict()
	.transform(
		(row): TaskingSummary => ({
			id: row.id,
			title: row.title,
			responsibility:
				row.responsible_group_name === null
					? { kind: 'organization' }
					: { kind: 'group', name: row.responsible_group_name },
			status: row.status,
			requiredCount: row.staffing_required,
			pickedCount: row.staffing_picked,
			suspenseOn: row.suspense_on,
			execution:
				row.execution_starts_on && row.execution_ends_on
					? { startsOn: row.execution_starts_on, endsOn: row.execution_ends_on }
					: null
		})
	);

export type EventWorkItem = { kind: 'full'; tasking: Tasking } | { kind: 'summary'; summary: TaskingSummary };

export interface EventWorkGroup {
	phase: EventWorkPhase;
	items: EventWorkItem[];
}

const itemDates = (item: EventWorkItem): EventWorkDates => (item.kind === 'full' ? item.tasking : item.summary);
const itemTitle = (item: EventWorkItem) => (item.kind === 'full' ? item.tasking.title : item.summary.title);
const itemId = (item: EventWorkItem) => (item.kind === 'full' ? item.tasking.id : item.summary.id);

/** Phases in order, each ordered by suspense, then outcome, then id. A phase with nothing in it is left out. */
export function groupEventWork(event: EventDates, taskings: Tasking[], summaries: TaskingSummary[]): EventWorkGroup[] {
	const items: EventWorkItem[] = [
		...taskings.map((tasking): EventWorkItem => ({ kind: 'full', tasking })),
		...summaries.map((summary): EventWorkItem => ({ kind: 'summary', summary }))
	].sort(
		(a, b) =>
			itemDates(a).suspenseOn.localeCompare(itemDates(b).suspenseOn) ||
			itemTitle(a).localeCompare(itemTitle(b)) ||
			itemId(a).localeCompare(itemId(b))
	);
	return EVENT_WORK_PHASES.map((phase) => ({
		phase,
		items: items.filter((item) => eventWorkPhase(itemDates(item), event) === phase)
	})).filter((group) => group.items.length > 0);
}

export interface DateReviewItem {
	tasking: Tasking;
	phase: EventWorkPhase;
	/** Set when the Event's new dates moved the Tasking into another phase. */
	movedFrom: EventWorkPhase | null;
}

/**
 * The active Taskings an Event's date change leaves for review: the ones that changed phase and the
 * ones sitting outside the new dates. Nothing here is changed for the operator.
 */
export function taskingsToReview(taskings: Tasking[], before: EventDates, after: EventDates): DateReviewItem[] {
	return taskings
		.filter((tasking) => isActiveStatus(tasking.status.kind))
		.map((tasking) => {
			const phase = eventWorkPhase(tasking, after);
			const previous = eventWorkPhase(tasking, before);
			return { tasking, phase, movedFrom: previous === phase ? null : previous };
		})
		.filter(
			(item) => item.movedFrom !== null || item.phase !== 'execution' || executesOutside(item.tasking.execution, after)
		);
}

function executesOutside(execution: EventWorkDates['execution'], event: EventDates): boolean {
	return execution !== null && (execution.startsOn < event.startsOn || execution.endsOn > event.endsOn);
}

export const datesChanged = (before: EventDates, after: EventDates) =>
	before.startsOn !== after.startsOn || before.endsOn !== after.endsOn;
