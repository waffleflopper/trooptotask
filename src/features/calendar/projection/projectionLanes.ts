import type { CalendarLane, LaneSegment } from '$features/calendar/utils/calendarLanes';
import { dayTrack, spanTrack, statusTrack } from '$features/calendar/utils/calendarLanes';
import EventsLaneSegmentView, {
	type EventsLaneSegment
} from '$features/calendar/components/projection/EventsLaneSegment.svelte';
import ProjectionLaneStatusView, {
	type ProjectionLaneStatus
} from '$features/calendar/components/projection/ProjectionLaneStatus.svelte';
import SuspenseLaneCell, {
	type SuspenseLaneDay
} from '$features/calendar/components/projection/SuspenseLaneCell.svelte';
import { formatDate, formatDayMonthYear } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';
import type { CalendarProjection, CalendarTaskingFacts, ProjectedEvent } from './calendarProjection';
import type { ProjectionCardChoice } from './projectionCards';
import { indexSpan, packRows } from './projectionLayout';

export interface ProjectionLinks {
	events: string;
	event(id: string): string;
	tasking(id: string): string;
}

export type ProjectionRegion =
	| { readonly kind: 'loading' }
	| { readonly kind: 'error'; readonly retry?: () => void }
	| { readonly kind: 'ready'; readonly projection: CalendarProjection; readonly facts: CalendarTaskingFacts };

export interface ProjectionLaneInput {
	dates: readonly Date[];
	region: ProjectionRegion;
	links: ProjectionLinks;
	/**
	 * The month draws suspenses as diamonds in the date headers. Ten pixel columns have no header room, so the
	 * compact view keeps a Suspenses lane whose day offers one control that opens a list.
	 */
	density: 'month' | 'compact';
	/** The reader's day, after which an active suspense is overdue. */
	today: string;
}

const SUMMARY_LIMIT = 6;
const EVENT_ROWS = 2;

export function eventDatesLabel(event: Pick<ProjectedEvent, 'startsOn' | 'endsOn'>): string {
	return event.startsOn === event.endsOn
		? formatDayMonthYear(event.startsOn)
		: `${formatDayMonthYear(event.startsOn)} to ${formatDayMonthYear(event.endsOn)}`;
}

function eventLabel(event: ProjectedEvent): string {
	const host = event.host === null ? 'we host' : `hosted by ${event.host}`;
	return `${event.title}, ${eventDatesLabel(event)}, ${host}${event.cancelled ? ', cancelled' : ''}`;
}

function summarize(prefix: string, labels: readonly string[]): string {
	if (labels.length === 0) return `${prefix}: none in view`;
	const shown = labels.slice(0, SUMMARY_LIMIT).join('. ');
	return labels.length > SUMMARY_LIMIT
		? `${prefix}: ${shown}. ${labels.length - SUMMARY_LIMIT} more`
		: `${prefix}: ${shown}`;
}

export function buildProjectionLanes(input: ProjectionLaneInput): CalendarLane[] {
	const { region } = input;
	const withSuspenses = input.density === 'compact';
	if (region.kind !== 'ready') {
		return [
			statusLane('events', 'Events', region),
			...(withSuspenses ? [statusLane('suspenses', 'Suspenses', region, false)] : [])
		];
	}
	return [
		eventsLane(input, region.projection, region.facts),
		...(withSuspenses ? [suspensesLane(input, region.projection)] : [])
	];
}

function statusLane(kind: string, label: string, region: ProjectionRegion, withRetry = true): CalendarLane {
	const status: ProjectionLaneStatus =
		region.kind === 'error'
			? { kind: 'error', what: label, retry: withRetry ? region.retry : undefined }
			: { kind: 'loading', what: label };
	return {
		key: kind,
		kind,
		label,
		rows: kind === 'events' ? EVENT_ROWS : 1,
		summary: region.kind === 'error' ? `${label} could not be loaded` : `Loading ${label}`,
		track: statusTrack(ProjectionLaneStatusView, status)
	};
}

function eventsLane(
	input: ProjectionLaneInput,
	projection: CalendarProjection,
	facts: CalendarTaskingFacts
): CalendarLane {
	const dateKeys = input.dates.map(formatDate);
	const first = toDayNumber(dateKeys[0]);
	const inView = projection.events.filter((event) => event.startsOn <= dateKeys.at(-1)! && event.endsOn >= dateKeys[0]);
	// Live Events first, then by start with the longer first, so an Event inside another drops to the second row.
	const ordered = [...inView].sort(
		(a, b) =>
			Number(a.cancelled) - Number(b.cancelled) ||
			a.startsOn.localeCompare(b.startsOn) ||
			b.endsOn.localeCompare(a.endsOn) ||
			a.title.localeCompare(b.title) ||
			a.id.localeCompare(b.id)
	);
	const { runs, overflow } = packRows(
		ordered.map((event) => indexSpan(event, first)),
		EVENT_ROWS,
		dateKeys.length
	);
	const choiceOf = (event: ProjectedEvent): ProjectionCardChoice => ({
		key: event.id,
		title: event.title,
		detail: eventDatesLabel(event) + (event.cancelled ? ', cancelled' : ''),
		href: input.links.event(event.id),
		target: { kind: 'event', id: event.id }
	});

	const segments = runs.map((run): LaneSegment<EventsLaneSegment> => {
		const nextInRow = runs.find((other) => other.row === run.row && other.start > run.end);
		// What fits no row is offered from the bottom-row Events it overlaps.
		const others =
			run.row === EVENT_ROWS - 1
				? overflow.filter((event) => {
						const span = indexSpan(event, first);
						return span.start <= run.end && span.end >= run.start;
					})
				: [];
		const event = run.item;
		return {
			start: run.start,
			end: run.end,
			value: {
				title: event.title,
				href: input.links.event(event.id),
				target: { kind: 'event', id: event.id },
				label: eventLabel(event),
				cancelled: event.cancelled,
				hosted: event.host === null,
				taskings: facts.events[event.id]?.total ?? 0,
				row: run.row,
				continuesBefore: run.continuesBefore,
				continuesAfter: run.continuesAfter,
				days: run.end - run.start + 1,
				room: (nextInRow?.start ?? dateKeys.length) - run.end - 1,
				self: choiceOf(event),
				others: others.map(choiceOf)
			}
		};
	});

	const period = input.density === 'month' ? 'this month' : 'in view';
	return {
		key: 'events',
		kind: 'events',
		label: 'Events',
		rows: EVENT_ROWS,
		detail: `${inView.length} ${period}`,
		detailHref: input.links.events,
		summary: summarize('Events', inView.map(eventLabel)),
		track: spanTrack(EventsLaneSegmentView, segments)
	};
}

/** Each visible day's active suspenses, for the date headers or the compact lane. */
export function suspenseDays(
	input: Pick<ProjectionLaneInput, 'dates' | 'links' | 'today'>,
	projection: CalendarProjection
): SuspenseLaneDay[] {
	const dateKeys = input.dates.map(formatDate);
	const byDate = new Map<string, SuspenseLaneDay['markers'][number][]>();
	for (const suspense of projection.suspenses) {
		if (suspense.suspenseOn < dateKeys[0] || suspense.suspenseOn > dateKeys.at(-1)!) continue;
		const markers = byDate.get(suspense.suspenseOn) ?? [];
		const overdue = suspense.suspenseOn < input.today;
		markers.push({
			key: suspense.taskingId,
			title: suspense.title,
			detail: `${overdue ? 'Overdue' : 'Suspense'} ${formatDayMonthYear(suspense.suspenseOn)}`,
			href: input.links.tasking(suspense.taskingId),
			target: { kind: 'tasking', id: suspense.taskingId },
			label: `${overdue ? 'Overdue suspense' : 'Suspense'}: ${suspense.title}`
		});
		byDate.set(suspense.suspenseOn, markers);
	}

	return dateKeys.map(
		(key): SuspenseLaneDay => ({
			dateLabel: formatDayMonthYear(key),
			markers: byDate.get(key) ?? [],
			overdue: key < input.today
		})
	);
}

function suspensesLane(input: ProjectionLaneInput, projection: CalendarProjection): CalendarLane {
	const days = suspenseDays(input, projection);
	const due = days.reduce((total, day) => total + day.markers.length, 0);
	return {
		key: 'suspenses',
		kind: 'suspenses',
		label: 'Suspenses',
		detail: due === 0 ? 'None' : `${due} due`,
		summary: summarize(
			'Suspenses',
			days.flatMap((day) => day.markers.map((marker) => `${marker.title}, ${day.dateLabel}`))
		),
		track: dayTrack(SuspenseLaneCell, days)
	};
}
