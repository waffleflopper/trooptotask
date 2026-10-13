import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelGovernanceDeletionPort } from './contracts';
import { finishFileCleanup, parseFileDeletion } from './artifactWrites.server';
import { fail } from '$lib/errors';

/** An Organization reviewer can delete exactly one of its counseling records. */
export function createSupabasePersonnelGovernanceDeletionPort(
	getAdminClient: () => SupabaseClient,
	requirePending: (
		orgId: string,
		requestId: string,
		resourceType: 'counseling_record',
		resourceId: string
	) => Promise<void>
): PersonnelGovernanceDeletionPort {
	return {
		async deleteApprovedCounselingRecord(actor, requestId, recordId, reviewedAt) {
			const decision = evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: actor.role, userId: actor.userId },
				action: POLICY_ACTION_CATALOG.organization.reviewDeletionRequests,
				capabilityMap: actor.capabilityMap,
				scopeSet: { kind: 'organization' },
				resource: { kind: 'organization' }
			});
			if (!actor.userId || !actor.orgId || !decision.allowed) fail(403, 'Deletion review access denied');

			const admin = getAdminClient();
			const [, { data: row, error: readError }] = await Promise.all([
				requirePending(actor.orgId, requestId, 'counseling_record', recordId),
				admin
					.from('counseling_records')
					.select('personnel_id,file_path')
					.eq('organization_id', actor.orgId)
					.eq('id', recordId)
					.maybeSingle()
			]);
			if (readError) throw new Error(readError.message);
			if (!row) fail(404, 'Counseling record not found');

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

			const receipt = await admin.rpc('personnel_file_artifact_deletion', {
				p_organization_id: actor.orgId,
				p_personnel_id: row.personnel_id,
				p_kind: 'counseling',
				p_artifact_id: recordId
			});
			let deletion = null;
			try {
				deletion = receipt.error ? null : parseFileDeletion(receipt.data);
			} catch {
				return { fileCleanup: 'pending' };
			}
			return { fileCleanup: deletion ? await finishFileCleanup(admin, deletion) : 'pending' };
		}
	};
}
