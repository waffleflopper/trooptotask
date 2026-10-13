import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import type { FileCleanup } from './contracts';

export interface RetiredOrganizationFile {
	bucket_id: string;
	object_name: string;
}

const DRAIN_PAGE_SIZE = 100;
const DRAIN_MAX_PAGES = 10;

/**
 * Removes bytes under keys the database already retired. A retired key never
 * accepts new bytes, so removal and completion can repeat safely; an
 * unconfirmed removal leaves the key pending for scheduled cleanup.
 */
export async function removeRetiredOrganizationFiles(
	admin: SupabaseClient,
	files: RetiredOrganizationFile[]
): Promise<FileCleanup> {
	const storage = createSupabaseStorageAdapter(admin);
	const byBucket = new Map<string, string[]>();
	for (const file of files) byBucket.set(file.bucket_id, [...(byBucket.get(file.bucket_id) ?? []), file.object_name]);
	let cleanup: FileCleanup = 'complete';
	for (const [bucket, names] of byBucket) {
		try {
			await storage.remove(bucket, names);
			const completed = await admin.rpc('complete_organization_file_retirements', {
				p_bucket_id: bucket,
				p_object_names: names
			});
			if (completed.error) cleanup = 'pending';
		} catch {
			cleanup = 'pending';
		}
	}
	return cleanup;
}

export interface RetiredFileDrainResult {
	removed: number;
	failed: number;
	/** The page budget ended on a full page, so more keys may be pending. It is not proof that any remain. */
	limitReached: boolean;
}

/** One bounded scheduled pass. Overlapping passes converge without a lease. */
export async function drainRetiredOrganizationFiles(admin: SupabaseClient): Promise<RetiredFileDrainResult> {
	let removed = 0;
	let failed = 0;
	let limitReached = false;
	for (let page = 0; page < DRAIN_MAX_PAGES; page++) {
		const listed = await admin.rpc('list_pending_organization_file_retirements', { p_limit: DRAIN_PAGE_SIZE });
		if (listed.error) throw new Error('Pending file cleanup could not be listed');
		const files = (listed.data ?? []) as RetiredOrganizationFile[];
		if (files.length === 0) break;
		if ((await removeRetiredOrganizationFiles(admin, files)) === 'complete') {
			removed += files.length;
		} else {
			let pageRemoved = 0;
			for (const file of files) {
				if ((await removeRetiredOrganizationFiles(admin, [file])) === 'complete') pageRemoved++;
				else failed++;
			}
			removed += pageRemoved;
			if (pageRemoved === 0) break;
		}
		if (files.length < DRAIN_PAGE_SIZE) break;
		limitReached = page === DRAIN_MAX_PAGES - 1;
	}
	return { removed, failed, limitReached };
}
