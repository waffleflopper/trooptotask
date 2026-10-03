import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { DeletionRequest } from './contracts';
import type { DeletionRequestStore } from './contracts.server';
import { TABLE } from './deletionRequestSupport.server';

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
			return data as DeletionRequest | null;
		},
		async findPendingByResource(orgId, resourceType, resourceId) {
			const { data, error } = await supabase
				.from(TABLE)
				.select('id')
				.eq('organization_id', orgId)
				.eq('resource_type', resourceType)
				.eq('resource_id', resourceId)
				.eq('status', 'pending')
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data as { id: string } | null;
		},
		async createRequest(orgId, input) {
			const { data, error } = await supabase
				.from(TABLE)
				.insert({
					organization_id: orgId,
					requested_by: input.requestedBy,
					requested_by_email: input.requesterEmail,
					resource_type: input.resourceType,
					resource_id: input.resourceId,
					resource_description: input.description,
					resource_url: input.resourceUrl,
					status: 'pending'
				})
				.select('*')
				.single();
			if (error) throw new Error(error.message);
			if (!data || typeof data.id !== 'string' || !data.id)
				throw new Error('Deletion request creation was not acknowledged');
			return data as DeletionRequest;
		},
		async listRequests(orgId, filter) {
			const result = await selectAllSupabaseRows<DeletionRequest>(async (from, to) => {
				let query = supabase.from(TABLE).select('*').eq('organization_id', orgId);
				if (filter.status) query = query.eq('status', filter.status);
				if (filter.requestedBy) query = query.eq('requested_by', filter.requestedBy);
				return query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
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
