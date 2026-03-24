import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoragePort } from '../core/ports';

export function createSupabaseStorageAdapter(supabase: SupabaseClient): StoragePort {
	return {
		async upload(
			bucket: string,
			path: string,
			data: File | Blob | ArrayBuffer,
			options?: { upsert?: boolean }
		): Promise<void> {
			const { error } = await supabase.storage.from(bucket).upload(path, data, { upsert: options?.upsert ?? false });
			if (error) throw new Error(`Storage upload failed: ${error.message}`);
		},

		async remove(bucket: string, paths: string[]): Promise<void> {
			const { error } = await supabase.storage.from(bucket).remove(paths);
			if (error) throw new Error(`Storage remove failed: ${error.message}`);
		},

		async createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
			const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
			if (error || !data) throw new Error(`Storage createSignedUrl failed: ${error?.message ?? 'No data returned'}`);
			return data.signedUrl;
		}
	};
}
