import type { SupabaseClient } from '$lib/server/database';

export interface PersonnelArtifactRetentionSource {
	deleteExpiredFollowUps(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredCounselingRecords(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredDocuments(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredLeaderNotes(orgId: string, cutoff: string): Promise<number>;
}

type ArtifactTable = 'personnel_follow_ups' | 'counseling_records' | 'personnel_documents' | 'leader_notes';

/**
 * Bind only after cron admission. Each family is one conditional statement, so
 * PostgreSQL rechecks a record restored while the statement waits, and the
 * file trigger retires the stored keys of deleted records in that transaction.
 */
export function createSupabasePersonnelArtifactRetentionSource(
	client: SupabaseClient
): PersonnelArtifactRetentionSource {
	async function deleteExpired(table: ArtifactTable, orgId: string, cutoff: string) {
		let query = client
			.from(table)
			.delete({ count: 'exact' })
			.eq('organization_id', orgId)
			.not('archived_at', 'is', null)
			.lt('archived_at', cutoff);
		if (table === 'personnel_follow_ups') query = query.filter('status', 'eq', 'archived');
		const { count, error } = await query;
		if (error) throw new Error(error.message);
		if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
			throw new Error('Personnel artifact retention returned no valid deletion count');
		return count;
	}
	return {
		deleteExpiredFollowUps: (orgId, cutoff) => deleteExpired('personnel_follow_ups', orgId, cutoff),
		deleteExpiredCounselingRecords: (orgId, cutoff) => deleteExpired('counseling_records', orgId, cutoff),
		deleteExpiredDocuments: (orgId, cutoff) => deleteExpired('personnel_documents', orgId, cutoff),
		deleteExpiredLeaderNotes: (orgId, cutoff) => deleteExpired('leader_notes', orgId, cutoff)
	};
}
