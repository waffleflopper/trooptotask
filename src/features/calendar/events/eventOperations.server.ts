import { z } from 'zod';
import { fail } from '$lib/errors';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { AuditPort } from '$lib/audit/contracts';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import {
	eventCancellationSchema,
	eventDraftSchema,
	type CalendarEvent,
	type EventDetail,
	type EventList,
	type EventListWhen,
	type MemberLabels
} from './eventModel';
import { EVENT_GONE, type CalendarEventPersistence } from './eventPersistence.server';

export interface CalendarEventPorts {
	auth: OrganizationAccessGrant;
	audit: AuditPort;
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

const audited = (action: string, event: CalendarEvent) => ({
	action: `calendar_event.${action}`,
	resourceType: 'calendar_event',
	resourceId: event.id,
	details: { title: event.title }
});

export async function listEvents(ctx: CalendarEventPorts, when: EventListWhen, today: string): Promise<EventList> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [events, members] = await Promise.all([ctx.calendarEvents.listEvents(when, today), ctx.memberLabels()]);
	return { events, members };
}

export async function loadEventDetail(ctx: CalendarEventPorts, id: string): Promise<EventDetail> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [event, activity, members] = await Promise.all([
		ctx.calendarEvents.findEvent(eventId(id)),
		ctx.calendarEvents.listActivity(id),
		ctx.memberLabels()
	]);
	if (!event) fail(404, EVENT_GONE);
	return { event, activity, members };
}

export async function createEvent(ctx: CalendarEventPorts, input: unknown): Promise<CalendarEvent> {
	const { id, draft } = parse(createInput, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const { event, created } = await ctx.calendarEvents.createEvent(id, draft);
	if (created) await ctx.audit.log(audited('created', event));
	return event;
}

export async function updateEvent(ctx: CalendarEventPorts, id: string, input: unknown): Promise<CalendarEvent> {
	const draft = parse(eventDraftSchema, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const event = await ctx.calendarEvents.updateEvent(eventId(id), draft);
	if (!event) fail(404, EVENT_GONE);
	await ctx.audit.log(audited('updated', event));
	return event;
}

export async function cancelEvent(ctx: CalendarEventPorts, id: string, input: unknown): Promise<CalendarEvent> {
	const { reason } = parse(eventCancellationSchema, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageEvents, ORGANIZATION);
	const event = await ctx.calendarEvents.cancelEvent(eventId(id), reason);
	await ctx.audit.log(audited('cancelled', event));
	return event;
}
