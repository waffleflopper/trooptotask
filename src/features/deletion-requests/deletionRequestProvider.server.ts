import type { Database, SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { DELETION_REQUEST_STATUSES, type DeletionRequest } from './contracts';
import type { DeletionRequestStore, DeletionRequestSubmissionPort } from './contracts.server';
import { TABLE } from './deletionRequestSupport.server';

type DeletionRequestRow = Database['public']['Tables']['deletion_requests']['Row'];

/** The column's CHECK constraint keeps every saved status inside the union; a value outside it is a broken contract. */
function toDeletionRequest(row: DeletionRequestRow): DeletionRequest {
	const status = DELETION_REQUEST_STATUSES.find((known) => known === row.status);
	if (!status) throw new Error(`Deletion request ${row.id} has an unknown status`);
	return { ...row, status };
}

/** The supplied request-user client preserves RLS; this factory creates no privileged client. */
export function createSupabaseDeletionRequestStore(supabase: SupabaseClient): DeletionRequestStore {
	return {
		async findPendingById(orgId, requestId, target) {
			let query = supabase
				.from(TABLE)
				.select('*')
				.eq('organization_id', orgId)
				.eq('id', requestId)
				.eq('status', 'pending');
			if (target) query = query.eq('resource_type', target.resourceType).eq('resource_id', target.resourceId);
			const { data, error } = await query.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? toDeletionRequest(data) : null;
		},
		async listRequests(orgId, filter) {
			const result = await selectAllSupabaseRows<DeletionRequestRow>(async (from, to) => {
				let query = supabase.from(TABLE).select('*').eq('organization_id', orgId);
				if (filter.status) query = query.eq('status', filter.status);
				if (filter.requestedBy) query = query.eq('requested_by', filter.requestedBy);
				return query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toDeletionRequest);
		},
		async readPendingSummary(orgId, requestedBy) {
			let query = supabase
				.from(TABLE)
				.select('created_at', { count: 'exact' })
				.eq('organization_id', orgId)
				.eq('status', 'pending');
			if (requestedBy) query = query.eq('requested_by', requestedBy);
			const { data, count, error } = await query.order('created_at', { ascending: true }).limit(1);
			if (error) throw new Error(error.message);
			if (count === null) throw new Error('Deletion request summary count was not returned');
			return { count, oldestCreatedAt: data?.[0]?.created_at ?? null };
		},
		async completePendingReview(orgId, requestId, target, review) {
			const { data, error } = await supabase
				.from(TABLE)
				.update({
					status: review.status,
					reviewed_by: review.reviewedBy,
					reviewed_at: review.reviewedAt,
					denial_reason: review.denialReason
				})
				.eq('organization_id', orgId)
				.eq('id', requestId)
				.eq('status', 'pending')
				.eq('resource_type', target.resourceType)
				.eq('resource_id', target.resourceId)
				.select('id')
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (data === null) return false;
			if (typeof data !== 'object' || Array.isArray(data) || data.id !== requestId) {
				throw new Error('Deletion request review was not acknowledged');
			}
			return true;
		},
		async listExportRows(orgId) {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) =>
				supabase.from(TABLE).select('*').eq('organization_id', orgId).order('id', { ascending: true }).range(from, to)
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
		}
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameUuid(saved: unknown, sent: string): boolean {
	return typeof saved === 'string' && saved.toLowerCase() === sent.toLowerCase();
}

/** Service-role submission; the caller binds the Organization and requester from the admitted actor. */
export function createSupabaseDeletionRequestSubmission(
	getClient: () => SupabaseClient
): DeletionRequestSubmissionPort {
	return {
		async submitPending(orgId, input) {
			const { data, error } = await getClient().rpc('submit_deletion_request', {
				p_organization_id: orgId,
				p_requested_by: input.requestedBy,
				p_requester_email: input.requesterEmail,
				p_resource_type: input.resourceType,
				p_resource_id: input.resourceId,
				p_description: input.description,
				p_resource_url: input.resourceUrl
			});
			if (error) throw new Error(error.message);
			if (isRecord(data) && data.outcome === 'duplicate') return { outcome: 'duplicate' };
			const request = isRecord(data) && data.outcome === 'created' ? data.request : null;
			if (
				!isRecord(request) ||
				typeof request.id !== 'string' ||
				!request.id ||
				!sameUuid(request.organization_id, orgId) ||
				!sameUuid(request.requested_by, input.requestedBy) ||
				request.resource_type !== input.resourceType ||
				!sameUuid(request.resource_id, input.resourceId) ||
				request.status !== 'pending'
			) {
				throw new Error('Deletion request submission was not acknowledged');
			}
			return { outcome: 'created', request: request as unknown as DeletionRequest };
		}
	};
}
