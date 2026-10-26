import { formatWeekdayDayMonth, getDayName, parseDate } from '$lib/utils/dates';
import { daysBetween } from '../events/eventModel';
import { eventWorkPhase, type EventWorkItem } from './eventWorkModel';
import type { EquipmentReadiness } from './taskingListsModel';
import {
	isActiveStatus,
	needsPeople,
	nextTaskingDate,
	taskingAttention,
	type StaffingCount,
	type StaffingRequirement,
	type Tasking,
	type TaskingList,
	type TaskingTimeline
} from './taskingModel';

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
export function peopleFact(requirement: StaffingRequirement | null, picked: number): RowFact {
	if (requirement === null) return picked > 0 ? { text: String(picked), tone: 'plain' } : NONE;
	return { text: `${picked} / ${requirement.count}`, tone: picked >= requirement.count ? 'success' : 'warning' };
}

export function equipmentFact(equipment: EquipmentReadiness | null): RowFact {
	if (equipment === null) return NONE;
	if (equipment.ready === equipment.total) return { text: 'Ready', tone: 'success' };
	return { text: `${equipment.ready} of ${equipment.total} ready`, tone: 'danger' };
}

/** The Event a Tasking serves and when against it, or that it stands alone. */
export function eventRelation(tasking: Pick<Tasking, 'event' | 'suspenseOn' | 'execution'>): string {
	if (!tasking.event) return 'Standalone · no event';
	const phase = eventWorkPhase(tasking, tasking.event);
	if (phase === 'preparation') return `${tasking.event.title} · prep`;
	return phase === 'closeout' ? `${tasking.event.title} · closeout` : tasking.event.title;
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
export function eventRowFacts(item: EventWorkItem, staffing: Record<string, StaffingCount>): RowFact | null {
	if (item.kind === 'summary') {
		const { requiredCount, pickedCount } = item.summary;
		if (requiredCount === null) return null;
		return {
			text: `${pickedCount} of ${requiredCount} picked`,
			tone: pickedCount >= requiredCount ? 'success' : 'warning'
		};
	}
	const { tasking } = item;
	const picked = staffing[tasking.id]?.picked ?? 0;
	const equipment = tasking.readiness.equipment;
	const equipmentReady = equipment === null || equipment.ready === equipment.total;
	const parts = [
		tasking.requirement && `${picked} of ${tasking.requirement.count} picked`,
		equipment && (equipmentReady ? 'equipment ready' : `equipment ${equipment.ready} of ${equipment.total} ready`)
	].filter((part) => typeof part === 'string');
	if (parts.length === 0) return null;
	const short = tasking.requirement !== null && picked < tasking.requirement.count;
	return { text: parts.join(' · '), tone: !equipmentReady ? 'danger' : short ? 'warning' : 'success' };
}

/** The coloured line over an Event's table. Rows outside the reader's scope carry no equipment, so they never read as ready. */
export interface EventWorkSummary {
	total: number;
	overdue: number;
	blocked: number;
	needPeople: number;
	ready: number;
}

export function summarizeEventWork(
	items: readonly EventWorkItem[],
	staffing: Record<string, StaffingCount>,
	today: string
): EventWorkSummary {
	const summary: EventWorkSummary = { total: items.length, overdue: 0, blocked: 0, needPeople: 0, ready: 0 };
	for (const item of items) {
		const status = item.kind === 'full' ? item.tasking.status.kind : item.summary.status;
		if (!isActiveStatus(status)) continue;
		const suspenseOn = item.kind === 'full' ? item.tasking.suspenseOn : item.summary.suspenseOn;
		const overdue = suspenseOn < today;
		const short =
			item.kind === 'full'
				? needsPeople(item.tasking, staffing[item.tasking.id])
				: item.summary.requiredCount !== null && item.summary.pickedCount < item.summary.requiredCount;
		if (overdue) summary.overdue += 1;
		if (status === 'blocked') summary.blocked += 1;
		if (short) summary.needPeople += 1;
		if (item.kind === 'full' && !overdue && status !== 'blocked' && !short && item.tasking.requirement) {
			const equipment = item.tasking.readiness.equipment;
			if (equipment === null || equipment.ready === equipment.total) summary.ready += 1;
		}
	}
	return summary;
}

/** An Event's active Taskings and how many of them are overdue, blocked or short of people. */
export interface EventTaskingRollup {
	total: number;
	needAction: number;
}

export function rollupEventTaskings(list: TaskingList, today: string): Record<string, EventTaskingRollup> {
	const rollups: Record<string, EventTaskingRollup> = {};
	for (const tasking of list.taskings) {
		if (!tasking.event || !isActiveStatus(tasking.status.kind)) continue;
		const rollup = (rollups[tasking.event.id] ??= { total: 0, needAction: 0 });
		rollup.total += 1;
		if (
			tasking.status.kind === 'blocked' ||
			taskingAttention(tasking, today) === 'overdue' ||
			needsPeople(tasking, list.staffing[tasking.id])
		)
			rollup.needAction += 1;
	}
	return rollups;
}

/** A past Event's Taskings are mostly closed, so no open ones says nothing about awareness. */
export function rollupFact(rollup: EventTaskingRollup | undefined, when: 'upcoming' | 'past' = 'upcoming'): RowFact {
	if (!rollup || rollup.total === 0)
		return { text: when === 'past' ? 'No open taskings' : 'Awareness only', tone: 'muted' };
	if (rollup.needAction > 0) return { text: `${rollup.total} · ${rollup.needAction} need action`, tone: 'danger' };
	return { text: `${rollup.total} · on track`, tone: 'plain' };
}
