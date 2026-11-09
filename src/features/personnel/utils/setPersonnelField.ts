import { buildRequestError } from '$lib/stores/core';
import type { PersonnelFieldBulkResult, PersonnelFieldChange } from '../contracts';

export const PERSONNEL_FIELD_UNCONFIRMED_MESSAGE = "We couldn't confirm the change. Reload to see what saved.";

/**
 * Rejects with a `StoreRequestError` carrying the reply's status, or with a plain `Error` when no reply proved the
 * outcome, so `classifyWrite` tells a refusal from an unconfirmed change.
 */
export async function setPersonnelField(
	orgId: string,
	personnelIds: string[],
	change: PersonnelFieldChange
): Promise<PersonnelFieldBulkResult> {
	let response: Response;
	try {
		response = await fetch(`/org/${orgId}/api/personnel/field-batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ personnelIds, ...change })
		});
	} catch {
		throw new Error(PERSONNEL_FIELD_UNCONFIRMED_MESSAGE);
	}
	if (!response.ok) throw await buildRequestError(response, 'POST', 'personnel/field-batch');
	const result: unknown = await response.json().catch(() => null);
	const { field, value, updatedIds, refusedIds, unavailableIds } = (result ?? {}) as Partial<PersonnelFieldBulkResult>;
	const requested = new Set(personnelIds);
	const isIdList = (ids: unknown): ids is string[] =>
		Array.isArray(ids) && ids.every((id) => typeof id === 'string' && requested.has(id));
	if (field !== change.field || typeof value !== 'string') throw new Error(PERSONNEL_FIELD_UNCONFIRMED_MESSAGE);
	if (!isIdList(updatedIds) || !isIdList(refusedIds) || !isIdList(unavailableIds)) {
		throw new Error(PERSONNEL_FIELD_UNCONFIRMED_MESSAGE);
	}
	const answered = [...updatedIds, ...refusedIds, ...unavailableIds];
	if (answered.length !== requested.size || new Set(answered).size !== requested.size) {
		throw new Error(PERSONNEL_FIELD_UNCONFIRMED_MESSAGE);
	}
	return { field, value, updatedIds, refusedIds, unavailableIds };
}
