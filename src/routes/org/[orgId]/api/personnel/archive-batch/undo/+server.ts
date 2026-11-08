import {
	type DeletionRequestCancellationPort,
	type DeletionRequestStore
} from '$features/deletion-requests/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	createRequestDeletionRequestCancellation,
	createRequestDeletionRequestStore,
	handle,
	readJsonBody,
	type RouteConfig
} from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArchiveBatchContext } from '$lib/server/adapters/requestContexts.server';
import { undoPersonnelArchive, type PersonnelArchiveUndoResult } from '$lib/server/personnelArchiveUndoDelivery';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';

export function _createPostConfig(
	store: Pick<DeletionRequestStore, 'findPendingById'>,
	cancellation: DeletionRequestCancellationPort
): RouteConfig<
	{ token: unknown },
	PersonnelArchiveUndoResult,
	ReturnType<typeof createRequestPersonnelArchiveBatchContext>
> {
	return {
		context: createRequestPersonnelArchiveBatchContext,
		mutation: true,
		policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResource: { kind: 'unscoped' },
		parseInput: async (event: RequestEvent) => ({ token: (await readJsonBody(event)).token }),
		fn: (ctx, input) => undoPersonnelArchive(ctx, input, { store, cancellation })
	};
}

export const POST: RequestHandler = (event) =>
	handle(
		_createPostConfig(
			createRequestDeletionRequestStore(event.locals),
			createRequestDeletionRequestCancellation(event.locals)
		)
	)(event);
