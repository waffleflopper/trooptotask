import { z } from 'zod';
import { BUILT_IN_ARMY_RANK_OPTIONS } from '$features/personnel/contracts';
import { formatDayMonth, formatDayMonthYear, getDayName, parseDate } from '$lib/utils/dates';
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

export interface OrganizationMemberOption {
	userId: string;
	label: string;
}

const memberSortName = (label: string) => {
	const [rank, ...name] = label.split(' ');
	return BUILT_IN_ARMY_RANK_OPTIONS.includes(rank) ? name.join(' ') : label;
};

export function memberOptions(members: MemberLabels): OrganizationMemberOption[] {
	return Object.entries(members)
		.map(([userId, label]) => ({ userId, label }))
		.sort((a, b) => memberSortName(a.label).localeCompare(memberSortName(b.label)) || a.userId.localeCompare(b.userId));
}

export interface EventList {
	when: EventListWhen;
	events: CalendarEvent[];
	members: MemberLabels;
	memberOptions: OrganizationMemberOption[];
	currentUserId: string;
}

export interface EventDetail {
	event: CalendarEvent;
	members: MemberLabels;
	memberOptions: OrganizationMemberOption[];
	currentUserId: string;
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

export function daysBetween(from: string, to: string): number {
	const day = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)));
	return Math.round((day(to) - day(from)) / 86_400_000);
}

const yearUnlessThis = (date: string, today: string) =>
	date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`;

/** "19 – 23 Oct" or "30 Oct – 2 Nov", with the year only when it is not the viewer's. */
export function shortEventDateRange({ startsOn, endsOn }: EventDates, today: string): string {
	const year = startsOn.slice(0, 4) === endsOn.slice(0, 4) ? yearUnlessThis(endsOn, today) : null;
	if (year === null) return eventDateRange({ startsOn, endsOn });
	if (startsOn === endsOn) return `${formatDayMonth(startsOn)}${year}`;
	const start =
		startsOn.slice(0, 7) === endsOn.slice(0, 7) ? String(Number(startsOn.slice(8))) : formatDayMonth(startsOn);
	return `${start} – ${formatDayMonth(endsOn)}${year}`;
}

const weekday = (date: string) => getDayName(parseDate(date));

/** "Mon 19 – Fri 23 Oct", "Fri 30 Oct – Mon 2 Nov" or "Mon 19 Oct", with the year only when it is not the viewer's. */
export function eventDayRange({ startsOn, endsOn }: EventDates, today: string): string {
	const end = `${weekday(endsOn)} ${formatDayMonth(endsOn)}${yearUnlessThis(endsOn, today)}`;
	if (startsOn === endsOn) return end;
	const start =
		startsOn.slice(0, 7) === endsOn.slice(0, 7)
			? `${weekday(startsOn)} ${Number(startsOn.slice(8))}`
			: `${weekday(startsOn)} ${formatDayMonth(startsOn)}${startsOn.slice(0, 4) === endsOn.slice(0, 4) ? '' : ` ${startsOn.slice(0, 4)}`}`;
	return `${start} – ${end}`;
}

/** How far the viewer's day is from the Event, for the line above its dates. */
export function eventCountdown(
	event: EventDates & Pick<CalendarEvent, 'cancellation'>,
	today: string
): { text: string; upcoming: boolean } {
	if (event.cancellation) return { text: 'Cancelled', upcoming: false };
	const phase = eventPhase(event, today);
	if (phase === 'past') return { text: `Ended ${formatDayMonth(event.endsOn)}`, upcoming: false };
	if (phase === 'ongoing') {
		const length = daysBetween(event.startsOn, event.endsOn) + 1;
		const text = length === 1 ? 'Today' : `Day ${daysBetween(event.startsOn, today) + 1} of ${length}`;
		return { text, upcoming: true };
	}
	const days = daysBetween(today, event.startsOn);
	return { text: days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`, upcoming: true };
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
