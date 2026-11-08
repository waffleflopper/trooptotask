import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import {
	FIELD_BATCH_UNCONFIRMED_MESSAGE,
	type BulkField,
	type PersonnelFieldBatchResult,
	type PersonnelFieldOutcome
} from '../contracts';

const OUTCOMES: readonly PersonnelFieldOutcome[] = ['updated', 'refused', 'unavailable', 'failed'];

/** Sets one field for the People in one request. Resolves only when every requested Person has exactly one outcome. */
export async function setPersonnelField(
	orgId: string,
	personnelIds: string[],
	field: BulkField,
	value: string
): Promise<PersonnelFieldBatchResult> {
	let response: Response;
	try {
		response = await fetch(`/org/${orgId}/api/personnel/field-batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ personnelIds, field, value })
		});
	} catch {
		throw new Error(FIELD_BATCH_UNCONFIRMED_MESSAGE);
	}
	if (!response.ok) {
		const failure = await buildRequestError(response, 'POST', 'personnel/field-batch');
		throw new Error(rejectedRequestMessage(failure, FIELD_BATCH_UNCONFIRMED_MESSAGE));
	}
	const body: unknown = await response.json().catch(() => null);
	const reply = (body ?? {}) as Partial<PersonnelFieldBatchResult>;
	const requested = new Set(personnelIds);
	const results = reply.results;
	const answered = new Set<string>();
	const complete =
		reply.field === field &&
		typeof reply.value === 'string' &&
		Array.isArray(results) &&
		results.every(
			(result) =>
				typeof result?.id === 'string' &&
				requested.has(result.id) &&
				!answered.has(result.id) &&
				answered.add(result.id) &&
				OUTCOMES.includes(result.outcome) &&
				(result.message === undefined || typeof result.message === 'string')
		) &&
		answered.size === requested.size;
	if (!complete) throw new Error(FIELD_BATCH_UNCONFIRMED_MESSAGE);
	return { field, value: reply.value as string, results: results as PersonnelFieldBatchResult['results'] };
}
