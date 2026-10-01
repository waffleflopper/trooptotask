import type { SupabaseClient } from '@supabase/supabase-js';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeReadStore } from './ratingSchemeReadPorts.server';
import { fail } from '$lib/errors';

interface ApprovedRatingSchemeDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedRatingSchemeDeletionPort {
	deleteApprovedRatingSchemeEntry(
		actor: ApprovedRatingSchemeDeletionActor,
		requestId: string,
		entryId: string
	): Promise<void>;
}

/** Review authority and the exact pending request are checked before obtaining a privileged provider. */
export function createSupabaseApprovedRatingSchemeDeletionPort(
	requestStore: Pick<RatingSchemeReadStore, 'findOne'>,
	getAdminClient: () => SupabaseClient
): ApprovedRatingSchemeDeletionPort {
	return {
		async deleteApprovedRatingSchemeEntry(actor, requestId, entryId) {
			const decision = evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: actor.role, canManageMembers: actor.canManageMembers, userId: actor.userId },
				action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
				capabilityMap: actor.capabilityMap,
				scopeSet: { kind: 'organization' },
				resource: { kind: 'organization' }
			});
			if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');

			const request = await requestStore.findOne<{ id: string }>(
				'deletion_requests',
				actor.orgId,
				{ id: requestId, status: 'pending', resource_type: 'rating_scheme_entry', resource_id: entryId },
				'id'
			);
			if (!request) fail(404, 'Pending deletion request not found');

			const { error } = await getAdminClient()
				.from('rating_scheme_entries')
				.delete()
				.eq('organization_id', actor.orgId)
				.eq('id', entryId);
			if (error) throw new Error(error.message);
			// A preceding deletion can persist when the coordinator's request-status write fails.
			// Retrying that same pending request must still complete its status transition.
		}
	};
}
