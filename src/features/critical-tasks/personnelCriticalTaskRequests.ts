import { buildRequestError } from '$lib/stores/core';
import type { PersonnelIctCompletionCreate } from './contracts';

async function send(orgId: string, method: 'POST' | 'PUT', body: Record<string, unknown>): Promise<void> {
	const response = await fetch(`/org/${orgId}/api/personnel-ict-completions`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw await buildRequestError(response, method, 'critical task validation');
}

export function recordCriticalTaskValidation(orgId: string, validation: PersonnelIctCompletionCreate): Promise<void> {
	return send(orgId, 'POST', validation);
}

export function correctCriticalTaskValidation(
	orgId: string,
	id: string,
	validation: Omit<PersonnelIctCompletionCreate, 'personnelId' | 'ictTaskId'>
): Promise<void> {
	return send(orgId, 'PUT', { id, ...validation });
}
