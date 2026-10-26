import { buildRequestError } from '$lib/stores/core';
import type { StaffingPicker, StaffingSave, StaffingSaveResult } from './staffingModel';

const peoplePath = (orgId: string, taskingId: string) => `/org/${orgId}/api/calendar-taskings/${taskingId}/people`;

export async function loadStaffingPickerRequest(orgId: string, taskingId: string): Promise<StaffingPicker> {
	const response = await fetch(peoplePath(orgId, taskingId));
	if (!response.ok) throw await buildRequestError(response, 'GET', 'calendar-taskings');
	return response.json();
}

/** A conflict resolves instead of rejecting, carrying the selection someone else saved. */
export async function saveStaffingRequest(
	orgId: string,
	taskingId: string,
	save: StaffingSave
): Promise<StaffingSaveResult> {
	const response = await fetch(peoplePath(orgId, taskingId), {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(save)
	});
	if (response.status === 409) {
		const body = await response
			.clone()
			.json()
			.catch(() => null);
		if (body?.outcome === 'conflict') return body as StaffingSaveResult;
	}
	if (!response.ok) throw await buildRequestError(response, 'PUT', 'calendar-taskings');
	return response.json();
}
