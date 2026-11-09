import {
	cancelDeletionRequest,
	type DeletionRequestCancellationPort,
	type DeletionRequestStore
} from '$features/deletion-requests/index.server';
import { restoreArchivedPersonnel, verifyArchiveUndo } from '$features/personnel/index.server';
import { fail, RequestFailure } from '$lib/errors';

export interface PersonnelArchiveUndoResult {
	restoredIds: string[];
	/** Archived again, restored by someone else, or out of the actor's reach; left as they are. */
	changedIds: string[];
	withdrawnRequestIds: string[];
	/** Requests an admin already reviewed or that were already withdrawn; nothing left to cancel. */
	reviewedRequestIds: string[];
}

type PersonnelArchiveUndoContext = Parameters<typeof restoreArchivedPersonnel>[0];

/**
 * Takes back an archive by the token it returned: restores the People it archived and withdraws the archival
 * requests it created. The token names who archived and what, so only that person can undo it, and only that.
 */
export async function undoPersonnelArchive(
	ctx: PersonnelArchiveUndoContext,
	input: { token: unknown },
	dependencies: { store: Pick<DeletionRequestStore, 'findPendingById'>; cancellation: DeletionRequestCancellationPort }
): Promise<PersonnelArchiveUndoResult> {
	const verdict = verifyArchiveUndo(input.token, { orgId: ctx.auth.orgId, actorId: ctx.auth.userId }, Date.now());
	if (!verdict.ok) {
		if (verdict.reason === 'expired') fail(410, 'This Undo has expired.');
		fail(403, 'This Undo is not available.');
	}
	const { claims } = verdict;

	const [people, requests] = await Promise.all([
		claims.personnelIds.length
			? restoreArchivedPersonnel(ctx, { archivedAt: claims.archivedAt, personnelIds: claims.personnelIds })
			: { restoredIds: [], changedIds: [] },
		Promise.allSettled(
			claims.requestIds.map((id) => cancelDeletionRequest({ auth: ctx.auth, audit: ctx.audit, ...dependencies }, id))
		)
	]);

	const withdrawnRequestIds: string[] = [];
	const reviewedRequestIds: string[] = [];
	let unexpected: unknown;
	requests.forEach((outcome, index) => {
		const id = claims.requestIds[index];
		if (outcome.status === 'fulfilled') withdrawnRequestIds.push(id);
		else if (outcome.reason instanceof RequestFailure && outcome.reason.status === 404) reviewedRequestIds.push(id);
		else unexpected ??= outcome.reason;
	});
	// Everything that could be undone has been; a failure on one request is reported, not hidden by the rest.
	if (unexpected) throw unexpected;
	return { ...people, withdrawnRequestIds, reviewedRequestIds };
}
