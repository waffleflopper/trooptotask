import type { ArchivePersonnelBatchResult } from '$features/personnel/contracts';
import { preparePersonnelArchiveBatch } from '$features/personnel/index.server';
import { createDeletionRequest } from '$features/deletion-requests/index.server';

type PersonnelArchiveBatchDeliveryContext = Parameters<typeof preparePersonnelArchiveBatch>[0] &
	Parameters<typeof createDeletionRequest>[0];

function errorStatus(error: unknown): number | undefined {
	return typeof error === 'object' && error !== null && 'status' in error
		? (error as { status?: number }).status
		: undefined;
}

/** Compose authorized Personnel archive outcomes with the retained approval workflow. */
export async function archivePersonnelBatch(
	ctx: PersonnelArchiveBatchDeliveryContext,
	input: { ids: string[]; userEmail: string }
): Promise<ArchivePersonnelBatchResult> {
	const batch = await preparePersonnelArchiveBatch(ctx, input.ids);
	const result: ArchivePersonnelBatchResult = { archivedIds: [], approvalRequestedIds: [], errors: [] };
	for (const id of batch.ids) {
		const outcome = await batch.archive(id);
		if (outcome.kind === 'archived') {
			result.archivedIds.push(id);
		} else if (outcome.kind === 'error') {
			result.errors.push({ id, message: outcome.message });
		} else {
			try {
				await createDeletionRequest(ctx, {
					resourceType: 'personnel',
					resourceId: id,
					resourceDescription: outcome.resourceDescription,
					resourceUrl: `/org/${ctx.auth.orgId}/personnel`,
					userEmail: input.userEmail
				});
				result.approvalRequestedIds.push(id);
			} catch (error) {
				if (errorStatus(error) === 409) {
					result.approvalRequestedIds.push(id);
				} else {
					result.errors.push({
						id,
						message: error instanceof Error ? error.message : 'Failed to submit archival request'
					});
				}
			}
		}
	}
	await batch.finish();
	return result;
}
