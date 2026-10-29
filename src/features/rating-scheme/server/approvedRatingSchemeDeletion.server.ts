import type { SupabaseClient } from '$lib/server/database';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

interface ApprovedRatingSchemeDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedRatingSchemeDeletionPort {
	approveRatingSchemeEntryDeletion(
		ctx: { readonly auth: ApprovedRatingSchemeDeletionActor; readonly disabledFeatures: readonly FeatureKey[] },
		requestId: string,
		entryId: string,
		reviewedAt: string
	): Promise<void>;
}

/** Delete an entry and approve its pending Organization review in one database command. */
export function createSupabaseApprovedRatingSchemeDeletionPort(
	getAdminClient: () => SupabaseClient
): ApprovedRatingSchemeDeletionPort {
	return {
		async approveRatingSchemeEntryDeletion(ctx, requestId, entryId, reviewedAt) {
			const actor = ctx.auth;
			const decision = evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: actor.role, userId: actor.userId },
				action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
				capabilityMap: actor.capabilityMap,
				scopeSet: { kind: 'organization' },
				resource: { kind: 'organization' }
			});
			if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');
			if (ctx.disabledFeatures.includes('evaluations')) fail(403, featureOffMessage('evaluations'));

			const { error } = await getAdminClient().rpc('approve_record_deletion_request', {
				p_organization_id: actor.orgId,
				p_request_id: requestId,
				p_resource_type: 'rating_scheme_entry',
				p_resource_id: entryId,
				p_reviewer_id: actor.userId,
				p_reviewed_at: reviewedAt
			});
			if (error?.code === 'P0002') fail(404, error.message);
			if (error) throw new Error(error.message);
		}
	};
}
