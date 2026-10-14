import type { DeletionRequest } from './contracts';
import type { DeletionRequestStore, DeletionRequestSubmissionPort } from './contracts.server';

export { deletionRequestTestProvider, savedRequest } from './deletionRequestTestProvider.server';

interface SyntheticRequestRows {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: { orderBy?: Array<{ column: string; ascending: boolean }> }
	): Promise<T[]>;
	insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>): Promise<T>;
}

/** Test-only named adapter over a caller's existing synthetic rows; no policy or production composition. */
export function createDeletionRequestTestStore(
	backing: SyntheticRequestRows
): DeletionRequestStore & DeletionRequestSubmissionPort {
	const table = 'deletion_requests';
	return {
		findPendingById(orgId, requestId, target) {
			return backing.findOne<DeletionRequest>(table, orgId, {
				id: requestId,
				status: 'pending',
				...(target ? { resource_type: target.resourceType, resource_id: target.resourceId } : {})
			});
		},
		async submitPending(orgId, input) {
			const pending = await backing.findOne<{ id: string }>(table, orgId, {
				resource_type: input.resourceType,
				resource_id: input.resourceId,
				status: 'pending'
			});
			if (pending) return { outcome: 'duplicate' };
			const request = await backing.insert<DeletionRequest>(table, orgId, {
				requested_by: input.requestedBy,
				requested_by_email: input.requesterEmail,
				resource_type: input.resourceType,
				resource_id: input.resourceId,
				resource_description: input.description,
				resource_url: input.resourceUrl,
				status: 'pending',
				reviewed_by: null,
				reviewed_at: null,
				denial_reason: null,
				created_at: new Date().toISOString()
			});
			return { outcome: 'created', request };
		},
		listRequests(orgId, filter) {
			return backing.findMany<DeletionRequest>(
				table,
				orgId,
				{
					...(filter.status ? { status: filter.status } : {}),
					...(filter.requestedBy ? { requested_by: filter.requestedBy } : {})
				},
				{ orderBy: [{ column: 'created_at', ascending: false }] }
			);
		},
		async readPendingSummary(orgId, requestedBy) {
			const rows = await backing.findMany<DeletionRequest>(
				table,
				orgId,
				{
					status: 'pending',
					...(requestedBy ? { requested_by: requestedBy } : {})
				},
				{ orderBy: [{ column: 'created_at', ascending: true }] }
			);
			return { count: rows.length, oldestCreatedAt: rows[0]?.created_at ?? null };
		},
		async completePendingReview(orgId, requestId, target, review) {
			// This models the conditional outcome for orchestration tests, not database wait/locking behavior.
			const row = await backing.findOne<DeletionRequest>(table, orgId, {
				id: requestId,
				status: 'pending',
				resource_type: target.resourceType,
				resource_id: target.resourceId
			});
			if (!row) return false;
			await backing.update(table, orgId, requestId, {
				status: review.status,
				reviewed_by: review.reviewedBy,
				reviewed_at: review.reviewedAt,
				denial_reason: review.denialReason
			});
			return true;
		},
		listExportRows(orgId) {
			return backing.findMany<Record<string, unknown>>(table, orgId);
		}
	};
}
