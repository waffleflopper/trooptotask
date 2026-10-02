import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { COUNSELING_RECORDS_BUCKET } from './personnelCounselingRecords.server';
import { PERSONNEL_DOCUMENTS_BUCKET } from './personnelDocuments.server';

export interface PersonnelRetentionSource {
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

interface FileManifestRow {
	id: string;
	personnel_id: string;
	file_path: string | null;
}

// IDs in targeted reads travel in a URL; mutation IDs travel in one RPC body.
const TARGETED_LOOKUP_SIZE = 100;

/** Bind only after cron admission; parent deletion remains one database transaction. */
export function createSupabasePersonnelRetentionSource(
	client: SupabaseClient,
	storage: { remove(bucket: string, paths: string[]): Promise<void> }
): PersonnelRetentionSource {
	async function readFiles(table: 'personnel_documents' | 'counseling_records', orgId: string, ids: string[]) {
		const result = await selectAllSupabaseRows<FileManifestRow>(async (from, to) => {
			const { data, error } = await client
				.from(table)
				.select('id, personnel_id, file_path')
				.eq('organization_id', orgId)
				.in('personnel_id', ids)
				.order('id', { ascending: true })
				.range(from, to);
			return { data, error };
		});
		if (result.error) throw new Error((result.error as { message?: string }).message ?? 'Personnel file read failed');
		return result.data ?? [];
	}

	return {
		async deleteExpired(orgId, cutoff) {
			const candidates = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('personnel')
					.select('id')
					.eq('organization_id', orgId)
					.not('archived_at', 'is', null)
					.lt('archived_at', cutoff)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (candidates.error)
				throw new Error((candidates.error as { message?: string }).message ?? 'Expired Personnel read failed');
			const ids = (candidates.data ?? []).map((row) => row.id);
			if (ids.length === 0) return 0;

			const documents: FileManifestRow[] = [];
			const counselings: FileManifestRow[] = [];
			for (let start = 0; start < ids.length; start += TARGETED_LOOKUP_SIZE) {
				const cohort = ids.slice(start, start + TARGETED_LOOKUP_SIZE);
				const [documentRows, counselingRows] = await Promise.all([
					readFiles('personnel_documents', orgId, cohort),
					readFiles('counseling_records', orgId, cohort)
				]);
				for (const row of documentRows) documents.push(row);
				for (const row of counselingRows) counselings.push(row);
			}

			const { data: deletedCount, error } = await client.rpc('delete_expired_personnel', {
				p_org_id: orgId,
				p_candidate_ids: ids,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof deletedCount !== 'number' || !Number.isInteger(deletedCount) || deletedCount < 0)
				throw new Error('Personnel retention returned no valid deletion count');
			if (deletedCount === 0 || (!documents.some((row) => row.file_path) && !counselings.some((row) => row.file_path)))
				return deletedCount;

			// Complete every confirmation before either bucket loses a file.
			const remainingIds = new Set<string>();
			for (let start = 0; start < ids.length; start += TARGETED_LOOKUP_SIZE) {
				const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
					const { data, error } = await client
						.from('personnel')
						.select('id')
						.eq('organization_id', orgId)
						.in('id', ids.slice(start, start + TARGETED_LOOKUP_SIZE))
						.order('id', { ascending: true })
						.range(from, to);
					return { data, error };
				});
				if (result.error)
					throw new Error((result.error as { message?: string }).message ?? 'Personnel deletion confirmation failed');
				for (const row of result.data ?? []) remainingIds.add(row.id);
			}

			const removals = await Promise.allSettled(
				[
					{ bucket: PERSONNEL_DOCUMENTS_BUCKET, rows: documents },
					{ bucket: COUNSELING_RECORDS_BUCKET, rows: counselings }
				].map(async ({ bucket, rows }) => {
					const paths = rows
						.filter((row) => !remainingIds.has(row.personnel_id))
						.map((row) => row.file_path)
						.filter((path): path is string => typeof path === 'string' && path.length > 0);
					if (paths.length > 0) await storage.remove(bucket, paths);
				})
			);
			for (const removal of removals) {
				if (removal.status === 'rejected') throw removal.reason;
			}
			return deletedCount;
		}
	};
}
