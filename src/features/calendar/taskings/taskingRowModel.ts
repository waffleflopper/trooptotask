import { formatWeekdayDayMonth, getDayName, parseDate } from '$lib/utils/dates';
import { daysBetween } from '../events/eventModel';
import type { EventWorkItem } from './eventWorkModel';
import { nextTaskingDate, taskingAttention, type TaskingTimeline } from './taskingModel';
import type { EventTaskingSummary, TaskingRowFacts } from './taskingReadModel';

/** How a fact reads at a glance; each surface maps it to its own text colour. */
export type FactTone = 'danger' | 'warning' | 'success' | 'plain' | 'muted';

export interface RowFact {
	text: string;
	tone: FactTone;
}

const NONE: RowFact = { text: '—', tone: 'muted' };

/** "Thu 15 Oct", with the year only when it is not the viewer's. */
export const rowDay = (date: string, today: string) =>
	date.slice(0, 4) === today.slice(0, 4)
		? formatWeekdayDayMonth(date)
		: `${formatWeekdayDayMonth(date)} ${date.slice(0, 4)}`;

/** `picked / required`: short of people warns, filled reads as done, nothing required is a dash. */
export function peopleFact({ picked, required }: Pick<TaskingRowFacts, 'picked' | 'required'>): RowFact {
	if (required === null) return picked > 0 ? { text: String(picked), tone: 'plain' } : NONE;
	return { text: `${picked} / ${required}`, tone: picked >= required ? 'success' : 'warning' };
}

/** Closeout work counts what came back; everything else counts what is ready. */
export function equipmentFact({
	equipment,
	eventRelation
}: Pick<TaskingRowFacts, 'equipment' | 'eventRelation'>): RowFact {
	if (equipment.total === 0) return NONE;
	if (eventRelation === 'closeout')
		return {
			text: `${equipment.returnedQuantity} of ${equipment.totalQuantity} returned`,
			tone: equipment.returnedQuantity >= equipment.totalQuantity ? 'success' : 'plain'
		};
	if (equipment.ready === equipment.total) return { text: 'Ready', tone: 'success' };
	return { text: `${equipment.ready} of ${equipment.total} ready`, tone: 'danger' };
}

/** The accessible name of the amber conflict marker. */
export const conflictLabel = (people: number) =>
	people === 1 ? '1 person has a conflicting status' : `${people} people have a conflicting status`;

/** The Event a Tasking serves and when against it, or that it stands alone. */
export function eventRelation(
	event: { title: string } | null,
	relation: TaskingRowFacts['eventRelation'] | undefined
): string {
	if (!event || relation === 'standalone') return 'Standalone · no event';
	if (relation === 'preparation') return `${event.title} · prep`;
	return relation === 'closeout' ? `${event.title} · closeout` : event.title;
}

export interface NextDateFacts {
	primary: RowFact;
	due: string;
}

const dayCount = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

/**
 * What comes next for a Tasking and its suspense. `report` names the report time and weekday instead of
 * the start date, for rows that already sit under their Event's dates.
 */
export function nextDateFacts(
	tasking: TaskingTimeline,
	today: string,
	{ report = false }: { report?: boolean } = {}
): NextDateFacts {
	const due = `Due ${rowDay(tasking.suspenseOn, today)}`;
	if (tasking.status.kind === 'completed') return { primary: { text: 'Completed', tone: 'muted' }, due };
	if (tasking.status.kind === 'cancelled') return { primary: { text: 'Cancelled', tone: 'muted' }, due };
	if (taskingAttention(tasking, today) === 'overdue')
		return { primary: { text: `Overdue ${dayCount(daysBetween(tasking.suspenseOn, today))}`, tone: 'danger' }, due };
	const next = nextTaskingDate(tasking, today);
	if (next.label === 'Starts') {
		const reportTime = tasking.execution?.reportTime;
		const text =
			report && reportTime
				? `Report ${reportTime.replace(':', '')} ${getDayName(parseDate(next.on))}`
				: `Starts ${rowDay(next.on, today)}`;
		return { primary: { text, tone: 'plain' }, due };
	}
	const days = daysBetween(today, tasking.suspenseOn);
	if (days === 0) return { primary: { text: 'Due today', tone: 'warning' }, due };
	return { primary: { text: days === 1 ? 'Tomorrow' : `In ${dayCount(days)}`, tone: 'plain' }, due };
}

/** A row's state and dates, whether the reader sees the whole Tasking or another scope's summary. */
export const itemTimeline = (item: EventWorkItem): TaskingTimeline =>
	item.kind === 'full'
		? item.tasking
		: { status: { kind: item.summary.status }, suspenseOn: item.summary.suspenseOn, execution: item.summary.execution };

/** The staffing and equipment line under a row in an Event's table, coloured by what still needs doing. */
export function eventRowFacts(item: EventWorkItem, facts: TaskingRowFacts | undefined): RowFact | null {
	if (item.kind === 'summary') {
		const { requiredCount, pickedCount } = item.summary;
		if (requiredCount === null) return null;
		return {
			text: `${pickedCount} of ${requiredCount} picked`,
			tone: pickedCount >= requiredCount ? 'success' : 'warning'
		};
	}
	if (!facts) return null;
	const { picked, required, equipment, eventRelation: relation } = facts;
	const closeout = relation === 'closeout';
	const equipmentReady = equipment.ready === equipment.total;
	const equipmentPart =
		equipment.total === 0
			? null
			: closeout
				? `${equipment.returnedQuantity} of ${equipment.totalQuantity} returned`
				: equipmentReady
					? 'equipment ready'
					: `equipment ${equipment.ready} of ${equipment.total} ready`;
	const parts = [required !== null && `${picked} of ${required} picked`, equipmentPart].filter(
		(part) => typeof part === 'string'
	);
	if (parts.length === 0) return null;
	const short = required !== null && picked < required;
	const tone: FactTone =
		!closeout && !equipmentReady ? 'danger' : short ? 'warning' : closeout && required === null ? 'plain' : 'success';
	return { text: parts.join(' · '), tone };
}

/** The coloured line over an Event's table, in the order a commander reads it. Conflicts are amber, never red. */
export function eventSummaryLine(summary: EventTaskingSummary): (RowFact & { conflicts?: number })[] {
	const parts: (RowFact & { count: number; conflicts?: number })[] = [
		{ count: summary.overdue, text: `${summary.overdue} overdue`, tone: 'danger' },
		{ count: summary.blocked, text: `${summary.blocked} blocked`, tone: 'danger' },
		{
			count: summary.needPeople,
			text: `${summary.needPeople} ${summary.needPeople === 1 ? 'needs' : 'need'} people`,
			tone: 'warning'
		},
		{
			count: summary.conflicts,
			text: `${summary.conflicts} ${summary.conflicts === 1 ? 'conflict' : 'conflicts'}`,
			tone: 'warning',
			conflicts: summary.conflicts
		},
		{
			count: summary.fullyStaffedAndReady,
			text: `${summary.fullyStaffedAndReady} fully staffed and ready`,
			tone: 'success'
		}
	];
	return parts.filter((part) => part.count > 0).map(({ count: _count, ...part }) => part);
}

/** The Events list's Taskings cell. An Event with no Taskings at all is one the unit only needs to know about. */
export function rollupFact(summary: EventTaskingSummary | undefined): RowFact {
	if (!summary || summary.total === 0) return { text: 'Awareness only', tone: 'muted' };
	if (summary.needAction > 0) return { text: `${summary.total} · ${summary.needAction} need action`, tone: 'danger' };
	return { text: `${summary.total} · on track`, tone: 'plain' };
}
