import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoragePort } from '$lib/storage/contracts';

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
			const keys = [...new Set(paths)];
			for (let offset = 0; offset < keys.length; offset += 1000) {
				const batch = keys.slice(offset, offset + 1000);
				const { data, error } = await supabase.storage.from(bucket).remove(batch);
				if (error) throw new Error(`Storage remove failed: ${error.message}`);
				const remaining = new Set(batch);
				if (
					!Array.isArray(data) ||
					data.some((entry) => !entry || typeof entry.name !== 'string' || !remaining.delete(entry.name))
				) {
					throw new Error('Storage remove failed: Invalid deletion response');
				}
			}
		},

		async createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
			const storage = supabase.storage.from(bucket);
			const { data, error } = await storage.createSignedUrl(path, expiresInSeconds);
			if (error || !data)
				throw new Error(`Storage createSignedUrl failed: ${error?.message ?? 'Invalid signing response'}`);
			let signed: URL;
			try {
				signed = new URL(data.signedUrl);
			} catch {
				throw new Error('Storage createSignedUrl failed: Invalid signing response');
			}
			const publicRoot = storage.getPublicUrl('').data.publicUrl;
			const publicUrl = storage.getPublicUrl(path).data.publicUrl;
			const routeOffset = publicRoot.lastIndexOf('/object/public/');
			const expected = new URL(
				`${publicUrl.slice(0, routeOffset)}/object/sign/${publicUrl.slice(routeOffset + '/object/public/'.length)}`
			);
			const tokens = signed.searchParams.getAll('token');
			if (
				!['http:', 'https:'].includes(signed.protocol) ||
				signed.origin !== expected.origin ||
				signed.pathname !== expected.pathname ||
				signed.username ||
				signed.password ||
				signed.hash ||
				tokens.length !== 1 ||
				!tokens[0].trim()
			) {
				throw new Error('Storage createSignedUrl failed: Invalid signing response');
			}
			return data.signedUrl;
		}
	};
}
