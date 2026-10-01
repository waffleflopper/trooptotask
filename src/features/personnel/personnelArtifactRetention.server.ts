import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { COUNSELING_RECORDS_BUCKET } from '$lib/server/core/useCases/personnelCounselingRecords';
import { PERSONNEL_DOCUMENTS_BUCKET } from '$lib/server/core/useCases/personnelDocuments';

export interface PersonnelArtifactRetentionSource {
	deleteExpiredFollowUps(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredCounselingRecords(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredDocuments(orgId: string, cutoff: string): Promise<number>;
	deleteExpiredLeaderNotes(orgId: string, cutoff: string): Promise<number>;
}

type ArtifactTable = 'personnel_follow_ups' | 'counseling_records' | 'personnel_documents' | 'leader_notes';
interface Candidate {
	id: string;
	file_path?: string | null;
}

const TARGETED_LOOKUP_SIZE = 100;
const STORAGE_REMOVAL_SIZE = 1000;

/** Bind only after cron admission. Child discovery/deletion remains nontransactional. */
export function createSupabasePersonnelArtifactRetentionSource(
	client: SupabaseClient,
	storage: { remove(bucket: string, paths: string[]): Promise<void> }
): PersonnelArtifactRetentionSource {
	async function deleteExpired(table: ArtifactTable, orgId: string, cutoff: string, bucket?: string) {
		const discovery = await selectAllSupabaseRows<Candidate>(async (from, to) => {
			let query = (bucket ? client.from(table).select('id, file_path') : client.from(table).select('id'))
				.eq('organization_id', orgId)
				.not('archived_at', 'is', null)
				.lt('archived_at', cutoff)
				.order('id', { ascending: true })
				.range(from, to);
			if (table === 'personnel_follow_ups') query = query.eq('status', 'archived');
			const { data, error } = await query;
			return { data, error };
		});
		if (discovery.error)
			throw new Error((discovery.error as { message?: string }).message ?? 'Expired Personnel artifact read failed');
		const rows = discovery.data ?? [];
		const ids = rows.map((row) => row.id);
		let deletedCount = 0;
		for (let start = 0; start < ids.length; start += TARGETED_LOOKUP_SIZE) {
			// Only IDs discovered above are deleted. This does not recheck a
			// concurrent child restore or make separately committed cohorts atomic.
			const { data, error } = await client
				.from(table)
				.delete()
				.eq('organization_id', orgId)
				.in('id', ids.slice(start, start + TARGETED_LOOKUP_SIZE))
				.select('id');
			if (error) throw new Error(error.message);
			deletedCount += data?.length ?? 0;
		}
		if (
			!bucket ||
			deletedCount === 0 ||
			!rows.some((row) => typeof row.file_path === 'string' && row.file_path.length > 0)
		)
			return deletedCount;

		// Finish every deletion and confirmation before any file removal. A
		// failed later stage can leave deleted rows and their original bytes.
		const remainingIds = new Set<string>();
		for (let start = 0; start < ids.length; start += TARGETED_LOOKUP_SIZE) {
			const confirmation = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from(table)
					.select('id')
					.eq('organization_id', orgId)
					.in('id', ids.slice(start, start + TARGETED_LOOKUP_SIZE))
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (confirmation.error)
				throw new Error(
					(confirmation.error as { message?: string }).message ?? 'Personnel artifact deletion confirmation failed'
				);
			for (const row of confirmation.data ?? []) remainingIds.add(row.id);
		}
		const paths = rows
			.filter((row) => !remainingIds.has(row.id))
			.map((row) => row.file_path)
			.filter((path): path is string => typeof path === 'string' && path.length > 0);
		for (let start = 0; start < paths.length; start += STORAGE_REMOVAL_SIZE)
			await storage.remove(bucket, paths.slice(start, start + STORAGE_REMOVAL_SIZE));
		return deletedCount;
	}
	return {
		deleteExpiredFollowUps: (orgId, cutoff) => deleteExpired('personnel_follow_ups', orgId, cutoff),
		deleteExpiredCounselingRecords: (orgId, cutoff) =>
			deleteExpired('counseling_records', orgId, cutoff, COUNSELING_RECORDS_BUCKET),
		deleteExpiredDocuments: (orgId, cutoff) =>
			deleteExpired('personnel_documents', orgId, cutoff, PERSONNEL_DOCUMENTS_BUCKET),
		deleteExpiredLeaderNotes: (orgId, cutoff) => deleteExpired('leader_notes', orgId, cutoff)
	};
}
