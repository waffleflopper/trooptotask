import { z } from 'zod';
import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';

export const EVENT_TITLE_MAX = 200;
export const EVENT_HOST_MAX = 200;
export const EVENT_LOCATION_MAX = 200;
export const EVENT_DESCRIPTION_MAX = 4000;
export const EVENT_SOURCE_MAX = 500;
export const EVENT_CANCELLATION_REASON_MAX = 1000;

/** The current Organization runs it, or another host named in free text. No tenant relationship is implied. */
export type EventHost = { kind: 'organization' } | { kind: 'external'; name: string };

export interface EventDates {
	startsOn: string;
	endsOn: string;
}

export interface EventCancellation {
	at: string;
	/** Null only when the cancelling account no longer exists. */
	by: string | null;
	reason: string | null;
}

export interface CalendarEvent extends EventDates {
	id: string;
	title: string;
	host: EventHost;
	/** A member contact. It grants nothing. */
	coordinatorUserId: string;
	location: string | null;
	description: string | null;
	sourceReference: string | null;
	cancellation: EventCancellation | null;
}

export interface EventCoordination {
	host: EventHost;
	coordinatorUserId: string;
}

export type EventActivityFact =
	| { kind: 'created' }
	| { kind: 'dates_changed'; from: EventDates; to: EventDates }
	| { kind: 'coordination_changed'; from: EventCoordination; to: EventCoordination }
	| { kind: 'cancelled'; reason: string | null };

export type EventActivity = EventActivityFact & { id: number; at: string; actorUserId: string | null };

/** Every current member of the Organization, by user id. A coordinator or actor missing here has left. */
export type MemberLabels = Record<string, string>;

export interface EventList {
	when: EventListWhen;
	events: CalendarEvent[];
	members: MemberLabels;
}

export interface EventDetail {
	event: CalendarEvent;
	members: MemberLabels;
}

/** A streamed read that answers instead of rejecting, so one failed region leaves the rest of the page working. */
export type EventRead<T> = { status: 'loaded'; value: T } | { status: 'failed' } | { status: 'gone' };

/** Upcoming lists every event not yet over; past lists the most recent ones that are. */
export type EventListWhen = 'upcoming' | 'past';
export const PAST_EVENT_LIMIT = 100;

export type EventPhase = 'upcoming' | 'ongoing' | 'past';

export function eventPhase(dates: EventDates, today: string): EventPhase {
	if (today < dates.startsOn) return 'upcoming';
	return today > dates.endsOn ? 'past' : 'ongoing';
}

/** "19 Oct 2026", "19 – 23 Oct 2026", "28 Oct – 2 Nov 2026" or "30 Dec 2026 – 2 Jan 2027". */
export function eventDateRange({ startsOn, endsOn }: EventDates): string {
	if (startsOn === endsOn) return formatDayMonthYear(startsOn);
	if (startsOn.slice(0, 4) !== endsOn.slice(0, 4))
		return `${formatDayMonthYear(startsOn)} – ${formatDayMonthYear(endsOn)}`;
	const start =
		startsOn.slice(0, 7) === endsOn.slice(0, 7) ? String(Number(startsOn.slice(8))) : formatDayMonth(startsOn);
	return `${start} – ${formatDayMonthYear(endsOn)}`;
}

export type EventSource = { kind: 'link'; url: string } | { kind: 'order'; text: string };

/** Mirrors `calendar_events.source_reference`: an http(s) link, or an order identifier that is not a link at all. */
export function parseSourceReference(value: string): EventSource | null {
	if (/^https?:\/\/\S+$/i.test(value)) return { kind: 'link', url: value };
	if (/^\s*[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^\s*(javascript|data|vbscript|file|blob):/i.test(value))
		return null;
	return { kind: 'order', text: value };
}

const requiredText = (label: string, max: number) =>
	z.string().trim().min(1, `Enter ${label}.`).max(max, `Keep ${label} to ${max} characters.`);

const optionalText = (label: string, max: number) =>
	z
		.string()
		.trim()
		.max(max, `Keep ${label} to ${max} characters.`)
		.nullable()
		.transform((value) => value || null);

export const eventHostSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('organization') }).strict(),
	z.object({ kind: z.literal('external'), name: requiredText('the host', EVENT_HOST_MAX) }).strict()
]) satisfies z.ZodType<EventHost>;

export const eventDraftSchema = z
	.object({
		title: requiredText('a title', EVENT_TITLE_MAX),
		startsOn: dateOnlySchema,
		endsOn: dateOnlySchema,
		host: eventHostSchema,
		coordinatorUserId: uuidSchema,
		location: optionalText('the location', EVENT_LOCATION_MAX),
		description: optionalText('the description', EVENT_DESCRIPTION_MAX),
		sourceReference: optionalText('the source reference', EVENT_SOURCE_MAX).refine(
			(value) => value === null || parseSourceReference(value) !== null,
			'Links must start with http:// or https://.'
		)
	})
	.strict()
	.refine((draft) => draft.endsOn >= draft.startsOn, {
		path: ['endsOn'],
		message: 'End on or after the start date.'
	});

export type EventDraft = z.output<typeof eventDraftSchema>;

export const eventCancellationSchema = z
	.object({ reason: optionalText('the reason', EVENT_CANCELLATION_REASON_MAX) })
	.strict();
