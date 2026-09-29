import type { SupabaseClient } from '@supabase/supabase-js';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { TrainingTypeEntity } from './trainingTypeEntity.server';

export interface ApprovedTrainingTypeDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedTrainingTypeDeletionPort {
	deleteApprovedTrainingType(
		actor: ApprovedTrainingTypeDeletionActor,
		requestId: string,
		typeId: string
	): Promise<void>;
}

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

/** Delete only the Training type named by a pending, authorized Organization review. */
export function createSupabaseApprovedTrainingTypeDeletionPort(
	getAdminClient: () => SupabaseClient
): ApprovedTrainingTypeDeletionPort {
	return {
		async deleteApprovedTrainingType(actor, requestId, typeId) {
			const decision = evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: actor.role, canManageMembers: actor.canManageMembers, userId: actor.userId },
				action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
				capabilityMap: actor.capabilityMap,
				scopeSet: { kind: 'organization' },
				resource: { kind: 'organization' }
			});
			if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');

			const admin = getAdminClient();
			const { data: request, error: requestError } = await admin
				.from('deletion_requests')
				.select('id')
				.eq('organization_id', actor.orgId)
				.eq('id', requestId)
				.eq('status', 'pending')
				.eq('resource_type', 'training_type')
				.eq('resource_id', typeId)
				.maybeSingle();
			if (requestError) throw new Error(requestError.message);
			if (!request) fail(404, 'Pending deletion request not found');

			const { data: deleted, error: deleteError } = await admin
				.from(TrainingTypeEntity.table)
				.delete()
				.eq('organization_id', actor.orgId)
				.eq('id', typeId)
				.select('id')
				.maybeSingle();
			if (deleteError) throw new Error(deleteError.message);
			if (!deleted) fail(404, 'Training type not found');
		}
	};
}
