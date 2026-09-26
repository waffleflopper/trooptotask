import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelGovernanceDeletionPort } from './contracts';
import { artifactFileTarget } from './artifactWrites.server';

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

/** An Organization reviewer can delete exactly one of its counseling records. */
export function createSupabasePersonnelGovernanceDeletionPort(
	getAdminClient: () => SupabaseClient
): PersonnelGovernanceDeletionPort {
	return {
		async deleteApprovedCounselingRecord(actor, recordId) {
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
			const { data: row, error: readError } = await admin
				.from('counseling_records')
				.select('personnel_id,file_path')
				.eq('organization_id', actor.orgId)
				.eq('id', recordId)
				.maybeSingle();
			if (readError) throw new Error(readError.message);
			if (!row) fail(404, 'Counseling record not found');

			if (row.file_path) {
				const bucket = artifactFileTarget('counseling', actor.orgId, row.personnel_id, row.file_path);
				const { error: storageError } = await admin.storage.from(bucket).remove([row.file_path]);
				if (storageError) throw new Error(`Storage remove failed: ${storageError.message}`);
			}

			const { data: deleted, error: deleteError } = await admin
				.from('counseling_records')
				.delete()
				.eq('organization_id', actor.orgId)
				.eq('id', recordId)
				.select('id')
				.maybeSingle();
			if (deleteError) throw new Error(deleteError.message);
			if (!deleted) fail(404, 'Counseling record not found');
		}
	};
}
