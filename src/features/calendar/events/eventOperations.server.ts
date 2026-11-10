import { z } from 'zod';
import { fail, RequestFailure } from '$lib/errors';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { evaluateAuthoritativePolicyDecision } from '$lib/access/index.server';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import {
	eventCancellationSchema,
	eventDeletionSchema,
	type EventDeletionResult,
	memberOptions,
	eventDraftSchema,
	type CalendarEvent,
	type EventActivity,
	type EventDetail,
	type EventRead,
	type EventList,
	type EventListWhen,
	type MemberLabels
} from './eventModel';
import { EVENT_GONE, type CalendarEventPersistence } from './eventPersistence.server';
import type { AuditPort } from '$lib/audit/contracts';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export interface CalendarEventPorts {
	auth: OrganizationAccessGrant;
	/** Records denied attempts. The changes themselves are audited by the database. */
	audit?: AuditPort;
	calendarEvents: CalendarEventPersistence;
	memberLabels(): Promise<MemberLabels>;
}

const ORGANIZATION = { kind: 'organization' } as const;
const createInput = z.object({ id: uuidSchema, draft: eventDraftSchema }).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	return parsed.data;
}

function eventId(id: string): string {
	if (!uuidSchema.safeParse(id).success) fail(404, EVENT_GONE);
	return id;
}

export async function listEvents(ctx: CalendarEventPorts, when: EventListWhen, today: string): Promise<EventList> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [events, members] = await Promise.all([ctx.calendarEvents.listEvents(when, today), ctx.memberLabels()]);
	return { when, events, members, memberOptions: memberOptions(members), currentUserId: ctx.auth.userId };
}

export async function loadEventDetail(ctx: CalendarEventPorts, id: string): Promise<EventDetail> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [event, members] = await Promise.all([ctx.calendarEvents.findEvent(eventId(id)), ctx.memberLabels()]);
	if (!event) fail(404, EVENT_GONE);
	return { event, members, memberOptions: memberOptions(members), currentUserId: ctx.auth.userId };
}

/** The coordinator choices for Create event, or nothing for a reader who cannot create one. */
export async function loadEventMembers(ctx: CalendarEventPorts): Promise<MemberLabels | null> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const decision = await evaluateAuthoritativePolicyDecision(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	return decision.allowed ? ctx.memberLabels() : null;
}

export async function listEventActivity(ctx: CalendarEventPorts, id: string): Promise<EventActivity[]> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	return ctx.calendarEvents.listActivity(eventId(id));
}

export async function createEvent(ctx: CalendarEventPorts, input: unknown): Promise<CalendarEvent> {
	const { id, draft } = parse(createInput, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const { event } = await ctx.calendarEvents.createEvent(id, draft);
	return event;
}

export async function updateEvent(ctx: CalendarEventPorts, id: string, input: unknown): Promise<CalendarEvent> {
	const draft = parse(eventDraftSchema, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const event = await ctx.calendarEvents.updateEvent(eventId(id), draft);
	if (!event) fail(404, EVENT_GONE);
	return event;
}

export async function cancelEvent(ctx: CalendarEventPorts, id: string, input: unknown): Promise<CalendarEvent> {
	const { reason } = parse(eventCancellationSchema, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	return ctx.calendarEvents.cancelEvent(eventId(id), reason);
}

export async function deleteEvent(ctx: CalendarEventPorts, id: string, input: unknown): Promise<EventDeletionResult> {
	const { taskings } = parse(eventDeletionSchema, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const event = await ctx.calendarEvents.findEvent(eventId(id));
	if (!event) fail(404, EVENT_GONE);
	return ctx.calendarEvents.deleteEvent(event.id, taskings);
}

export function settleEventRead<T>(read: Promise<T>): Promise<EventRead<T>> {
	return read.then(
		(value) => ({ status: 'loaded', value }),
		(cause) => {
			if (cause instanceof RequestFailure && cause.status === 404) return { status: 'gone' };
			console.error('[calendar-events] Failed to load:', sanitizeErrorForLog(cause));
			return { status: 'failed' };
		}
	);
}
