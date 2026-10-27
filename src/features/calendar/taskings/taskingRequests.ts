import { buildRequestError } from '$lib/stores/core';
import type { Tasking, TaskingDraft, TaskingTransition } from './taskingModel';

async function send(orgId: string, path: string, method: 'POST' | 'PATCH', body: unknown): Promise<Tasking> {
	const response = await fetch(`/org/${orgId}/api/calendar-taskings${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw await buildRequestError(response, method, 'calendar-taskings');
	return response.json();
}

/** `id` is minted once per draft, so a resend after a lost reply finds the Tasking instead of adding another. */
export const createTaskingRequest = (orgId: string, id: string, draft: TaskingDraft) =>
	send(orgId, '', 'POST', { id, draft });

export const updateTaskingRequest = (orgId: string, id: string, draft: TaskingDraft) =>
	send(orgId, `/${id}`, 'PATCH', draft);

export const transitionTaskingRequest = (orgId: string, id: string, transition: TaskingTransition) =>
	send(orgId, `/${id}/status`, 'POST', transition);
