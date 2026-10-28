import type { SupabaseClient } from '$lib/server/database';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

export interface ApprovedTrainingDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedTrainingDeletionPort {
	approveTrainingTypeDeletion(
		ctx: { readonly auth: ApprovedTrainingDeletionActor; readonly disabledFeatures: readonly FeatureKey[] },
		requestId: string,
		typeId: string,
		reviewedAt: string
	): Promise<void>;
	approveTrainingRecordDeletion(
		ctx: { readonly auth: ApprovedTrainingDeletionActor; readonly disabledFeatures: readonly FeatureKey[] },
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
		ctx: { readonly auth: ApprovedTrainingDeletionActor; readonly disabledFeatures: readonly FeatureKey[] },
		requestId: string,
		resourceType: 'training_type' | 'personnel_training',
		resourceId: string,
		reviewedAt: string
	): Promise<void> {
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
		if (ctx.disabledFeatures.includes('training')) fail(403, featureOffMessage('training'));

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
		approveTrainingTypeDeletion: (ctx, requestId, typeId, reviewedAt) =>
			approve(ctx, requestId, 'training_type', typeId, reviewedAt),
		approveTrainingRecordDeletion: (ctx, requestId, recordId, reviewedAt) =>
			approve(ctx, requestId, 'personnel_training', recordId, reviewedAt)
	};
}
