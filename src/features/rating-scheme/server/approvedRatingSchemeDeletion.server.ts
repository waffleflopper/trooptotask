import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemePersistence } from '../contracts';
import { fail } from '$lib/errors';

interface ApprovedRatingSchemeDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedRatingSchemeDeletionPort {
	deleteApprovedRatingSchemeEntry(
		actor: ApprovedRatingSchemeDeletionActor,
		requestId: string,
		entryId: string
	): Promise<void>;
}

/** Review authority and the exact pending request precede deletion under the request's Rating RLS. */
export function createApprovedRatingSchemeDeletionPort(
	ratingScheme: Pick<RatingSchemePersistence, 'delete'>,
	requirePending: (
		orgId: string,
		requestId: string,
		resourceType: 'rating_scheme_entry',
		resourceId: string
	) => Promise<void>
): ApprovedRatingSchemeDeletionPort {
	return {
		async deleteApprovedRatingSchemeEntry(actor, requestId, entryId) {
			const decision = evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: actor.role, userId: actor.userId },
				action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
				capabilityMap: actor.capabilityMap,
				scopeSet: { kind: 'organization' },
				resource: { kind: 'organization' }
			});
			if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');

			await requirePending(actor.orgId, requestId, 'rating_scheme_entry', entryId);

			await ratingScheme.delete(entryId);
			// A preceding deletion can persist when the coordinator's request-status write fails.
			// Retrying that same pending request must still complete its status transition.
		}
	};
}
