import { buildRequestError } from '$lib/stores/core';
import type {
	ChecklistChange,
	ChecklistItem,
	EquipmentChange,
	EquipmentDraft,
	EquipmentRequirement,
	TaskingListKind,
	TaskingLists
} from './taskingListsModel';

async function send<T>(orgId: string, path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
	const response = await fetch(`/org/${orgId}/api/calendar-taskings/${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) throw await buildRequestError(response, method, 'calendar-taskings');
	return (await response.json()) as T;
}

/** `id` is minted once per entry, so a resend after a lost reply finds the item instead of adding another. */
export const addEquipmentRequest = (orgId: string, taskingId: string, id: string, draft: EquipmentDraft) =>
	send<EquipmentRequirement>(orgId, `${taskingId}/equipment`, 'POST', { id, draft });

export const changeEquipmentRequest = (orgId: string, taskingId: string, id: string, change: EquipmentChange) =>
	send<EquipmentRequirement>(orgId, `${taskingId}/equipment/${id}`, 'PATCH', change);

export const removeEquipmentRequest = (orgId: string, taskingId: string, id: string) =>
	send<{ removed: boolean }>(orgId, `${taskingId}/equipment/${id}`, 'DELETE');

export const addChecklistItemRequest = (orgId: string, taskingId: string, id: string, label: string) =>
	send<ChecklistItem>(orgId, `${taskingId}/checklist`, 'POST', { id, label });

export const changeChecklistItemRequest = (orgId: string, taskingId: string, id: string, change: ChecklistChange) =>
	send<ChecklistItem>(orgId, `${taskingId}/checklist/${id}`, 'PATCH', change);

export const removeChecklistItemRequest = (orgId: string, taskingId: string, id: string) =>
	send<{ removed: boolean }>(orgId, `${taskingId}/checklist/${id}`, 'DELETE');

export const reorderListRequest = (orgId: string, taskingId: string, list: TaskingListKind, ids: string[]) =>
	send<TaskingLists>(orgId, `${taskingId}/${list}`, 'PUT', { ids });
