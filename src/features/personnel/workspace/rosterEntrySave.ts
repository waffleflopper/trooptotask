import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import type { ComposerEntry } from '../rosterComposer';
import { followUpDraftSpec, leaderNoteDraftSpec } from './personnelArtifactDraftSpecs';

/** Writes one follow-up or note on a Person's record. A failure rejects with a message the composer can show. */
export async function saveRosterEntry(
	fetchFn: typeof fetch,
	target: { orgId: string; personId: string },
	entry: ComposerEntry
): Promise<void> {
	const [spec, request] =
		entry.kind === 'follow-up'
			? ([followUpDraftSpec, followUpDraftSpec.encode({ ...entry, dueDate: entry.dueDate ?? '' })] as const)
			: ([leaderNoteDraftSpec, leaderNoteDraftSpec.encode({ text: entry.text })] as const);
	const url = spec.endpoint(target);
	try {
		const response = await fetchFn(url, { method: 'POST', headers: request.headers, body: request.body });
		if (!response.ok) throw await buildRequestError(response, 'POST', url);
	} catch (caught) {
		throw new Error(rejectedRequestMessage(caught, spec.errorFallback));
	}
}

export interface RosterEntryBatchResult {
	writtenIds: string[];
	unavailableIds: string[];
}

const BATCH_UNCONFIRMED = 'The entries may have been saved. Check a Log before trying again.';

/** Writes the same follow-up or note on each Person in one request. People the actor cannot write come back unavailable. */
export async function saveRosterEntryBatch(
	fetchFn: typeof fetch,
	orgId: string,
	personnelIds: string[],
	entry: ComposerEntry
): Promise<RosterEntryBatchResult> {
	const [path, body, fallback] =
		entry.kind === 'follow-up'
			? ([
					'follow-ups',
					{ personnelIds, title: entry.title, notes: entry.notes, dueDate: entry.dueDate },
					followUpDraftSpec.errorFallback
				] as const)
			: (['leader-notes', { personnelIds, text: entry.text }, leaderNoteDraftSpec.errorFallback] as const);
	const url = `/org/${orgId}/api/personnel/${path}/batch`;
	let response: Response;
	try {
		response = await fetchFn(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw await buildRequestError(response, 'POST', url);
	} catch (caught) {
		throw new Error(rejectedRequestMessage(caught, fallback));
	}
	const result: unknown = await response.json().catch(() => null);
	const { writtenIds, unavailableIds } = (result ?? {}) as Partial<RosterEntryBatchResult>;
	const requested = new Set(personnelIds);
	const isIdList = (ids: unknown): ids is string[] =>
		Array.isArray(ids) && ids.every((id) => typeof id === 'string' && requested.has(id));
	if (!isIdList(writtenIds) || !isIdList(unavailableIds)) throw new Error(BATCH_UNCONFIRMED);
	return { writtenIds, unavailableIds };
}
