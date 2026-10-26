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
import type { MarkerListItem } from '$features/calendar/components/projection/MarkerListPopover.svelte';
import type { CalendarProjection, ProjectedEvent } from './calendarProjection';
import { hiddenBehind, indexSpan, layoutSingleRow } from './projectionLayout';

export interface ProjectionLinks {
	event(id: string): string;
	tasking(id: string): string;
}

export type ProjectionRegion =
	| { readonly kind: 'loading' }
	| { readonly kind: 'error'; readonly retry?: () => void }
	| { readonly kind: 'ready'; readonly projection: CalendarProjection };

export interface ProjectionLaneInput {
	dates: readonly Date[];
	region: ProjectionRegion;
	links: ProjectionLinks;
	/** Ten pixel columns cannot hold a label beside a control, so a day offers one control that opens a list. */
	density: 'month' | 'compact';
}

const SUMMARY_LIMIT = 6;

export function eventDatesLabel(event: Pick<ProjectedEvent, 'startsOn' | 'endsOn'>): string {
	return event.startsOn === event.endsOn
		? formatDayMonthYear(event.startsOn)
		: `${formatDayMonthYear(event.startsOn)} to ${formatDayMonthYear(event.endsOn)}`;
}

function eventLabel(event: ProjectedEvent): string {
	return `${event.title}, ${eventDatesLabel(event)}${event.cancelled ? ', cancelled' : ''}`;
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
	if (region.kind !== 'ready')
		return [statusLane('events', 'Events', region), statusLane('suspenses', 'Suspenses', region, false)];
	return [eventsLane(input, region.projection), suspensesLane(input, region.projection)];
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
		summary: region.kind === 'error' ? `${label} could not be loaded` : `Loading ${label}`,
		track: statusTrack(ProjectionLaneStatusView, status)
	};
}

function eventsLane(input: ProjectionLaneInput, projection: CalendarProjection): CalendarLane {
	const dateKeys = input.dates.map(formatDate);
	const first = toDayNumber(dateKeys[0]);
	const inView = projection.events.filter((event) => event.startsOn <= dateKeys.at(-1)! && event.endsOn >= dateKeys[0]);
	// The most specific Event takes a day: a live one over a cancelled one, then the shortest, so a long Event
	// never hides the Events inside it.
	const ordered = [...inView].sort(
		(a, b) =>
			Number(a.cancelled) - Number(b.cancelled) ||
			toDayNumber(a.endsOn) - toDayNumber(a.startsOn) - (toDayNumber(b.endsOn) - toDayNumber(b.startsOn)) ||
			a.startsOn.localeCompare(b.startsOn) ||
			a.title.localeCompare(b.title) ||
			a.id.localeCompare(b.id)
	);
	const { runs, overflows } = layoutSingleRow(
		ordered.map((event) => indexSpan(event, first)),
		dateKeys.length,
		(event) => event.id
	);
	const itemOf = (event: ProjectedEvent): MarkerListItem => ({
		key: event.id,
		title: event.title,
		detail: eventDatesLabel(event) + (event.cancelled ? ', cancelled' : ''),
		href: input.links.event(event.id)
	});

	const segments = runs.map(
		(run, position): LaneSegment<EventsLaneSegment> => ({
			start: run.start,
			end: run.end,
			value: {
				title: run.item.title,
				href: input.links.event(run.item.id),
				label: eventLabel(run.item),
				cancelled: run.item.cancelled,
				continuesBefore: run.continuesBefore,
				continuesAfter: run.continuesAfter,
				days: run.end - run.start + 1,
				room: (runs[position + 1]?.start ?? dateKeys.length) - run.end - 1,
				self: itemOf(run.item),
				others: hiddenBehind(run, overflows, (event) => event.id).map(itemOf)
			}
		})
	);

	return {
		key: 'events',
		kind: 'events',
		label: 'Events',
		detail: inView.length === 0 ? 'None' : String(inView.length),
		summary: summarize('Events', inView.map(eventLabel)),
		track: spanTrack(EventsLaneSegmentView, segments)
	};
}

function suspensesLane(input: ProjectionLaneInput, projection: CalendarProjection): CalendarLane {
	const dateKeys = input.dates.map(formatDate);
	const byDate = new Map<string, SuspenseLaneDay['markers'][number][]>();
	let due = 0;
	for (const suspense of projection.suspenses) {
		if (suspense.suspenseOn < dateKeys[0] || suspense.suspenseOn > dateKeys.at(-1)!) continue;
		due++;
		const markers = byDate.get(suspense.suspenseOn) ?? [];
		markers.push({
			key: suspense.taskingId,
			title: suspense.title,
			detail: `Suspense ${formatDayMonthYear(suspense.suspenseOn)}`,
			href: input.links.tasking(suspense.taskingId),
			label: `Suspense: ${suspense.title}`
		});
		byDate.set(suspense.suspenseOn, markers);
	}

	const days = dateKeys.map(
		(key): SuspenseLaneDay => ({
			dateLabel: formatDayMonthYear(key),
			markers: byDate.get(key) ?? [],
			compact: input.density === 'compact'
		})
	);
	return {
		key: 'suspenses',
		kind: 'suspenses',
		label: 'Suspenses',
		detail: due === 0 ? 'None' : `${due} due`,
		summary: summarize(
			'Suspenses',
			dateKeys.flatMap((key) => (byDate.get(key) ?? []).map((marker) => `${marker.title}, ${formatDayMonthYear(key)}`))
		),
		track: dayTrack(SuspenseLaneCell, days)
	};
}
