import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import { PERSONNEL_FIELD_BATCH_LIMIT, type PersonnelFieldBulkResult, type PersonnelFieldChange } from '../contracts';

export const PERSONNEL_FIELD_UNCONFIRMED_MESSAGE = "We couldn't confirm the change. Reload to see what saved.";

/** Sends the People in batches the endpoint accepts, one after another, and combines the results. */
export async function setPersonnelField(
	orgId: string,
	personnelIds: string[],
	change: PersonnelFieldChange
): Promise<PersonnelFieldBulkResult> {
	const combined: PersonnelFieldBulkResult = {
		field: change.field,
		value: change.value,
		updatedIds: [],
		refusedIds: [],
		unavailableIds: []
	};
	for (let start = 0; start < personnelIds.length; start += PERSONNEL_FIELD_BATCH_LIMIT) {
		const batch = await sendBatch(orgId, personnelIds.slice(start, start + PERSONNEL_FIELD_BATCH_LIMIT), change);
		combined.value = batch.value;
		combined.updatedIds.push(...batch.updatedIds);
		combined.refusedIds.push(...batch.refusedIds);
		combined.unavailableIds.push(...batch.unavailableIds);
	}
	return combined;
}

async function sendBatch(
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
	if (!response.ok) {
		const failure = await buildRequestError(response, 'POST', 'personnel/field-batch');
		throw new Error(rejectedRequestMessage(failure, PERSONNEL_FIELD_UNCONFIRMED_MESSAGE));
	}
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
