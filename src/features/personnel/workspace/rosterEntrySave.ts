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
