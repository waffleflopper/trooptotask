import type { SupabaseClient } from '$lib/server/database';
import { z } from 'zod';
import { fail } from '$lib/errors';
import {
	PAST_EVENT_LIMIT,
	type CalendarEvent,
	type EventActivity,
	type EventDraft,
	type EventDeletionMode,
	type EventHost,
	type EventListWhen
} from './eventModel';

export const EVENT_GONE = 'That event is no longer available.';
export const EVENT_CANCELLED = 'This event was cancelled, so it can no longer change.';
export const EVENT_COORDINATOR_NOT_MEMBER = 'Choose a coordinator who is a member of this organization.';
const EVENT_DENIED = 'Events need Organization-wide Calendar operation access.';

export interface CalendarEventPersistence {
	listEvents(when: EventListWhen, today: string): Promise<CalendarEvent[]>;
	findEvent(id: string): Promise<CalendarEvent | null>;
	listActivity(eventId: string): Promise<EventActivity[]>;
	/** Retrying the same id converges on the event the first attempt created, with `created` false. */
	createEvent(id: string, draft: EventDraft): Promise<{ event: CalendarEvent; created: boolean }>;
	updateEvent(id: string, draft: EventDraft): Promise<CalendarEvent | null>;
	cancelEvent(id: string, reason: string | null): Promise<CalendarEvent>;
	deleteEvent(id: string, taskings: EventDeletionMode): Promise<number>;
}

const COLUMNS =
	'id, title, starts_on, ends_on, host_name, coordinator_user_id, location, description, source_reference, cancelled_at, cancelled_by, cancellation_reason';

const eventRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	starts_on: z.string(),
	ends_on: z.string(),
	host_name: z.string().nullable(),
	coordinator_user_id: z.string(),
	location: z.string().nullable(),
	description: z.string().nullable(),
	source_reference: z.string().nullable(),
	cancelled_at: z.string().nullable(),
	cancelled_by: z.string().nullable(),
	cancellation_reason: z.string().nullable()
});

const hostFrom = (name: string | null): EventHost =>
	name === null ? { kind: 'organization' } : { kind: 'external', name };

function toEvent(raw: unknown): CalendarEvent {
	const row = eventRowSchema.parse(raw);
	return {
		id: row.id,
		title: row.title,
		startsOn: row.starts_on,
		endsOn: row.ends_on,
		host: hostFrom(row.host_name),
		coordinatorUserId: row.coordinator_user_id,
		location: row.location,
		description: row.description,
		sourceReference: row.source_reference,
		cancellation:
			row.cancelled_at === null ? null : { at: row.cancelled_at, by: row.cancelled_by, reason: row.cancellation_reason }
	};
}

const deletionRowSchema = z.object({ taskings: z.number().int().nonnegative() });

const datesSchema = z.object({ startsOn: z.string(), endsOn: z.string() });
const coordinationSchema = z
	.object({ hostName: z.string().nullable(), coordinatorUserId: z.string() })
	.transform(({ hostName, coordinatorUserId }) => ({ host: hostFrom(hostName), coordinatorUserId }));

const activityRowSchema = z.object({ id: z.number(), occurred_at: z.string(), actor_id: z.string().nullable() }).and(
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('created') }),
		z.object({ kind: z.literal('dates_changed'), payload: z.object({ from: datesSchema, to: datesSchema }) }),
		z.object({
			kind: z.literal('coordination_changed'),
			payload: z.object({ from: coordinationSchema, to: coordinationSchema })
		}),
		z.object({ kind: z.literal('cancelled'), payload: z.object({ reason: z.string().nullable() }) })
	])
);

function toActivity(raw: unknown): EventActivity {
	const row = activityRowSchema.parse(raw);
	const base = { id: row.id, at: row.occurred_at, actorUserId: row.actor_id };
	switch (row.kind) {
		case 'created':
			return { ...base, kind: 'created' };
		case 'dates_changed':
			return { ...base, kind: 'dates_changed', ...row.payload };
		case 'coordination_changed':
			return { ...base, kind: 'coordination_changed', ...row.payload };
		case 'cancelled':
			return { ...base, kind: 'cancelled', reason: row.payload.reason };
	}
}

function draftColumns(draft: EventDraft) {
	return {
		title: draft.title,
		starts_on: draft.startsOn,
		ends_on: draft.endsOn,
		host_name: draft.host.kind === 'external' ? draft.host.name : null,
		coordinator_user_id: draft.coordinatorUserId,
		location: draft.location,
		description: draft.description,
		source_reference: draft.sourceReference
	};
}

function writeFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, EVENT_DENIED);
		case '55000':
			return fail(409, EVENT_CANCELLED);
		case 'P0002':
			return fail(404, EVENT_GONE);
		case '22023':
			return fail(400, 'Choose whether to keep or delete the linked taskings.');
		case '23514':
			if (error.message.includes('coordinator')) return fail(400, EVENT_COORDINATOR_NOT_MEMBER);
			return fail(400, 'Check the event details and try again.');
		default:
			throw new Error(error.message);
	}
}

export function createSupabaseCalendarEventPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarEventPersistence {
	const events = () => client.from('calendar_events').select(COLUMNS).eq('organization_id', orgId);

	async function findEvent(id: string) {
		const { data, error } = await events().eq('id', id).maybeSingle();
		if (error) throw new Error(error.message);
		return data ? toEvent(data) : null;
	}

	return {
		async listEvents(when, today) {
			const query =
				when === 'upcoming'
					? events().gte('ends_on', today).order('starts_on').order('ends_on').order('id')
					: events()
							.lt('ends_on', today)
							.order('ends_on', { ascending: false })
							.order('starts_on', { ascending: false })
							.order('id')
							.limit(PAST_EVENT_LIMIT);
			const { data, error } = await query;
			if (error) throw new Error(error.message);
			return (data ?? []).map(toEvent);
		},
		findEvent,
		async listActivity(eventId) {
			const { data, error } = await client
				.from('calendar_event_activity')
				.select('id, occurred_at, actor_id, kind, payload')
				.eq('organization_id', orgId)
				.eq('event_id', eventId)
				.order('id');
			if (error) throw new Error(error.message);
			return (data ?? []).map(toActivity);
		},
		async createEvent(id, draft) {
			const { data, error } = await client
				.from('calendar_events')
				.insert({ id, organization_id: orgId, ...draftColumns(draft) })
				.select(COLUMNS)
				.single();
			if (error?.code === '23505') {
				const existing = await findEvent(id);
				if (existing) return { event: existing, created: false };
			}
			if (error) return writeFailure(error);
			return { event: toEvent(data), created: true };
		},
		async updateEvent(id, draft) {
			const { data, error } = await client
				.from('calendar_events')
				.update(draftColumns(draft))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toEvent(data) : null;
		},
		async deleteEvent(id, taskings) {
			const { data, error } = await client
				.rpc('delete_calendar_event', {
					p_organization_id: orgId,
					p_event_id: id,
					p_taskings: taskings
				})
				.single();
			if (error) return writeFailure(error);
			return deletionRowSchema.parse(data).taskings;
		},
		async cancelEvent(id, reason) {
			const { error } = await client.rpc('cancel_calendar_event', {
				p_organization_id: orgId,
				p_event_id: id,
				p_reason: reason
			});
			if (error) return writeFailure(error);
			const event = await findEvent(id);
			if (!event) return fail(404, EVENT_GONE);
			return event;
		}
	};
}
