import type { SupabaseClient } from '@supabase/supabase-js';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

export interface ApprovedTrainingDeletionActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
}

export interface ApprovedTrainingDeletionPort {
	deleteApprovedTrainingType(actor: ApprovedTrainingDeletionActor, requestId: string, typeId: string): Promise<void>;
	deleteApprovedTrainingRecord(
		actor: ApprovedTrainingDeletionActor,
		requestId: string,
		recordId: string
	): Promise<void>;
}

/** Delete only the Training resource named by a pending, authorized Organization review. */
export function createSupabaseApprovedTrainingDeletionPort(
	getAdminClient: () => SupabaseClient,
	requirePending: (
		orgId: string,
		requestId: string,
		resourceType: 'training_type' | 'personnel_training',
		resourceId: string
	) => Promise<void>
): ApprovedTrainingDeletionPort {
	async function clientForPendingDeletion(
		actor: ApprovedTrainingDeletionActor,
		requestId: string,
		resourceId: string,
		resourceType: 'training_type' | 'personnel_training'
	): Promise<SupabaseClient> {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: actor.role, canManageMembers: actor.canManageMembers, userId: actor.userId },
			action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
			capabilityMap: actor.capabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});
		if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');

		await requirePending(actor.orgId, requestId, resourceType, resourceId);
		return getAdminClient();
	}

	return {
		async deleteApprovedTrainingType(actor, requestId, typeId) {
			const admin = await clientForPendingDeletion(actor, requestId, typeId, 'training_type');
			const { data: deleted, error: deleteError } = await admin
				.from('training_types')
				.delete()
				.eq('organization_id', actor.orgId)
				.eq('id', typeId)
				.select('id')
				.maybeSingle();
			if (deleteError) throw new Error(deleteError.message);
			if (!deleted) {
				// A prior source effect can persist when the request-status write fails.
				// Preserve foreign-ID concealment while allowing an absent target to retry.
				const { data: remaining, error: readError } = await admin
					.from('training_types')
					.select('id')
					.eq('id', typeId)
					.maybeSingle();
				if (readError) throw new Error(readError.message);
				if (remaining) fail(404, 'Training type not found');
			}
		},
		async deleteApprovedTrainingRecord(actor, requestId, recordId) {
			const admin = await clientForPendingDeletion(actor, requestId, recordId, 'personnel_training');
			const { error: deleteError } = await admin
				.from('personnel_trainings')
				.delete()
				.eq('organization_id', actor.orgId)
				.eq('id', recordId)
				.select('id')
				.maybeSingle();
			if (deleteError) throw new Error(deleteError.message);
			// The target can already be gone after a failed request-status write; retry must still succeed.
		}
	};
}
