import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import type { DeletionRequestCancellationPort } from './cancelDeletionRequest.server';

/** The ordinary request client supplies the authenticated identity to the narrow RPC. */
export function createSupabaseDeletionRequestCancellation(supabase: SupabaseClient): DeletionRequestCancellationPort {
	return {
		async cancelPendingRequest(organizationId, requestId) {
			const { data, error } = await supabase.rpc('cancel_own_deletion_request', {
				p_organization_id: organizationId,
				p_request_id: requestId
			});
			if (error) {
				if (error.code === 'P0002') fail(404, error.message);
				if (error.code === '42501') fail(403, error.message);
				throw new Error(error.message);
			}
			if (data !== true) throw new Error('Deletion request cancellation was not acknowledged');
		}
	};
}
