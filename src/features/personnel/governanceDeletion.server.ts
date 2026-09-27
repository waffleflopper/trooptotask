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
		async deleteApprovedCounselingRecord(actor, requestId, recordId, reviewedAt) {
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
			const [{ data: request, error: requestError }, { data: row, error: readError }] = await Promise.all([
				admin
					.from('deletion_requests')
					.select('id')
					.eq('organization_id', actor.orgId)
					.eq('id', requestId)
					.eq('status', 'pending')
					.eq('resource_type', 'counseling_record')
					.eq('resource_id', recordId)
					.maybeSingle(),
				admin
					.from('counseling_records')
					.select('personnel_id,file_path')
					.eq('organization_id', actor.orgId)
					.eq('id', recordId)
					.maybeSingle()
			]);
			if (requestError) throw new Error(requestError.message);
			if (!request) fail(404, 'Pending deletion request not found');
			if (readError) throw new Error(readError.message);
			if (!row) fail(404, 'Counseling record not found');

			if (row.file_path) {
				const bucket = artifactFileTarget('counseling', actor.orgId, row.personnel_id, row.file_path);
				const { error: storageError } = await admin.storage.from(bucket).remove([row.file_path]);
				if (storageError) throw new Error(`Storage remove failed: ${storageError.message}`);
			}

			const { error } = await admin.rpc('approve_counseling_deletion_request', {
				p_organization_id: actor.orgId,
				p_request_id: requestId,
				p_record_id: recordId,
				p_reviewer_id: actor.userId,
				p_reviewed_at: reviewedAt,
				p_expected_file_path: row.file_path
			});
			if (error?.code === 'P0002') fail(404, error.message);
			if (error) throw new Error(error.message);
		}
	};
}
