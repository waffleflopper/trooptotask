import type { EventTaskingSummary } from '../taskings/taskingReadModel';
import type { TaskingResponsibility, TaskingStatusKind } from '../taskings/taskingModel';
import type { CalendarProjection, CalendarTaskingFacts } from './calendarProjection';
import type { ProjectionTarget } from './projectionCards';
import type { ProjectionLinks } from './projectionLanes';

export interface EventCard {
	readonly kind: 'event';
	readonly id: string;
	readonly title: string;
	readonly startsOn: string;
	readonly endsOn: string;
	readonly cancelled: boolean;
	/** The other Organization running it; null when we host it. */
	readonly host: string | null;
	readonly taskings: EventTaskingSummary | null;
	readonly href: string;
	readonly addTaskingHref: string;
}

/** The one status step a card offers: the move that carries the work forward. */
export type CardStatusAction = 'start' | 'complete' | 'unblock';

export interface TaskingCard {
	readonly kind: 'tasking';
	readonly id: string;
	readonly title: string;
	readonly status: Extract<TaskingStatusKind, 'open' | 'in_progress' | 'blocked'>;
	readonly suspenseOn: string;
	readonly responsibility: TaskingResponsibility;
	readonly picked: number;
	readonly required: number | null;
	/** Picked People whose availability clashes with the execution dates. */
	readonly conflicts: number;
	/** The row the card was opened from, when that Person's commitment clashes. */
	readonly conflictingPersonId: string | null;
	readonly next: CardStatusAction;
	readonly href: string;
}

const NEXT: Record<TaskingCard['status'], CardStatusAction> = {
	open: 'start',
	in_progress: 'complete',
	blocked: 'unblock'
};

/** What a card shows for `target`, or null once the read no longer holds it, such as after it completes. */
export function projectionCard(
	target: ProjectionTarget,
	projection: CalendarProjection,
	facts: CalendarTaskingFacts,
	links: ProjectionLinks
): EventCard | TaskingCard | null {
	if (target.kind === 'event') {
		const event = projection.events.find((candidate) => candidate.id === target.id);
		if (!event) return null;
		const href = links.event(event.id);
		return {
			kind: 'event',
			id: event.id,
			title: event.title,
			startsOn: event.startsOn,
			endsOn: event.endsOn,
			cancelled: event.cancelled,
			host: event.host,
			taskings: facts.events[event.id] ?? null,
			href,
			addTaskingHref: `${href}?addTasking`
		};
	}

	const row = facts.taskings[target.id];
	if (!row || (row.status !== 'open' && row.status !== 'in_progress' && row.status !== 'blocked')) return null;
	const title =
		projection.suspenses.find((suspense) => suspense.taskingId === target.id)?.title ??
		projection.commitments.find((commitment) => commitment.taskingId === target.id)?.title;
	if (title === undefined) return null;
	const personConflicts =
		target.personnelId !== undefined &&
		projection.commitments.some(
			(commitment) =>
				commitment.taskingId === target.id && commitment.personnelId === target.personnelId && commitment.conflicts
		);
	return {
		kind: 'tasking',
		id: target.id,
		title,
		status: row.status,
		suspenseOn: row.suspenseOn,
		responsibility:
			row.responsibleGroupId === null ? { kind: 'organization' } : { kind: 'group', groupId: row.responsibleGroupId },
		picked: row.picked,
		required: row.required,
		conflicts: row.conflicts,
		conflictingPersonId: personConflicts ? (target.personnelId ?? null) : null,
		next: NEXT[row.status],
		href: links.tasking(target.id)
	};
}
