import { buildRequestError } from '$lib/stores/core';
import type { CalendarEvent, EventDraft, EventDeletionMode, EventDeletionResult } from './eventModel';

async function send<T = CalendarEvent>(
	orgId: string,
	path: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown
): Promise<T> {
	const response = await fetch(`/org/${orgId}/api/calendar-events${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw await buildRequestError(response, method, 'calendar-events');
	return response.json();
}

/** `id` is minted once per draft, so a resend after a lost reply finds the event instead of adding another. */
export const createEventRequest = (orgId: string, id: string, draft: EventDraft) =>
	send(orgId, '', 'POST', { id, draft });

export const updateEventRequest = (orgId: string, id: string, draft: EventDraft) =>
	send(orgId, `/${id}`, 'PATCH', draft);

export const cancelEventRequest = (orgId: string, id: string, reason: string | null) =>
	send(orgId, `/${id}/cancel`, 'POST', { reason });

export const deleteEventRequest = (
	orgId: string,
	eventId: string,
	taskings: EventDeletionMode
): Promise<EventDeletionResult> => send<EventDeletionResult>(orgId, `/${eventId}`, 'DELETE', { taskings });
