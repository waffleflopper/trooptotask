import type { SupabaseClient } from '@supabase/supabase-js';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

export interface ApprovedTrainingDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly capabilityMap: CapabilityMap;
	readonly disabledFeatures: readonly FeatureKey[];
}

export interface ApprovedTrainingDeletionPort {
	approveTrainingTypeDeletion(
		actor: ApprovedTrainingDeletionActor,
		requestId: string,
		typeId: string,
		reviewedAt: string
	): Promise<void>;
	approveTrainingRecordDeletion(
		actor: ApprovedTrainingDeletionActor,
		requestId: string,
		recordId: string,
		reviewedAt: string
	): Promise<void>;
}

/** Delete a Training resource and approve its pending Organization review in one database command. */
export function createSupabaseApprovedTrainingDeletionPort(
	getAdminClient: () => SupabaseClient
): ApprovedTrainingDeletionPort {
	async function approve(
		actor: ApprovedTrainingDeletionActor,
		requestId: string,
		resourceType: 'training_type' | 'personnel_training',
		resourceId: string,
		reviewedAt: string
	): Promise<void> {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: actor.role, userId: actor.userId },
			action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
			capabilityMap: actor.capabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});
		if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');
		if (actor.disabledFeatures.includes('training')) fail(403, featureOffMessage('training'));

		const { error } = await getAdminClient().rpc('approve_record_deletion_request', {
			p_organization_id: actor.orgId,
			p_request_id: requestId,
			p_resource_type: resourceType,
			p_resource_id: resourceId,
			p_reviewer_id: actor.userId,
			p_reviewed_at: reviewedAt
		});
		if (error?.code === 'P0002') fail(404, error.message);
		if (error) throw new Error(error.message);
	}

	return {
		approveTrainingTypeDeletion: (actor, requestId, typeId, reviewedAt) =>
			approve(actor, requestId, 'training_type', typeId, reviewedAt),
		approveTrainingRecordDeletion: (actor, requestId, recordId, reviewedAt) =>
			approve(actor, requestId, 'personnel_training', recordId, reviewedAt)
	};
}
