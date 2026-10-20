import { validateUUID } from '$lib/server/validation';
import type {
	OrganizationCleanupBucket,
	OrganizationCleanupFile,
	OrganizationDestructionPort
} from './destruction.server';

const buckets: OrganizationCleanupBucket[] = ['counseling-files', 'personnel-documents', 'training-certificates'];
const pageSize = 1000;

function canonicalId(orgId: string): string {
	if (!validateUUID(orgId)) throw new Error('Invalid organization target');
	return orgId.toLowerCase();
}

function isTargetPath(path: string, orgId: string): boolean {
	const slash = path.indexOf('/');
	return slash > 0 && path.slice(0, slash).toLowerCase() === orgId;
}

export function createSupabaseOrganizationDestructionPort(
	locals: Pick<App.Locals, 'supabase'>
): OrganizationDestructionPort {
	const supabase = locals.supabase;
	return {
		async findTarget(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('name')
				.eq('id', canonicalId(orgId))
				.maybeSingle();
			if (error) throw error;
			return data;
		},
		async hasCurrentCleanupAuthority(orgId) {
			const { data, error } = await supabase.rpc('organization_storage_object_is_owner_removable', {
				bucket_name: 'counseling-files',
				object_name: `${canonicalId(orgId)}/`
			});
			if (error) throw error;
			return data === true;
		},
		async discoverFiles(orgId) {
			const id = canonicalId(orgId);
			const files: OrganizationCleanupFile[] = [];
			for (const bucket of buckets) {
				const seenPaths = new Set<string>();
				const seenCursors = new Set<string>();
				let cursor: string | undefined;
				for (;;) {
					// V1 listing folds path case and returns relative names. Flat V2 preserves
					// exact keys, including case-distinct UUID prefixes and orphan objects.
					const { data, error } = await supabase.storage.from(bucket).listV2({
						prefix: '',
						with_delimiter: false,
						limit: pageSize,
						sortBy: { column: 'name', order: 'asc' },
						cursor
					});
					if (error) throw error;
					if (
						!data ||
						!Array.isArray(data.objects) ||
						!Array.isArray(data.folders) ||
						data.folders.length !== 0 ||
						data.objects.length > pageSize ||
						typeof data.hasNext !== 'boolean'
					)
						throw new Error('Incomplete Storage listing');
					for (const item of data.objects) {
						if (
							!item ||
							typeof item.name !== 'string' ||
							!item.name ||
							typeof item.id !== 'string' ||
							!item.id ||
							(item.key !== undefined && item.key !== item.name) ||
							seenPaths.has(item.name)
						)
							throw new Error('Invalid Storage object');
						seenPaths.add(item.name);
						if (isTargetPath(item.name, id)) files.push({ bucket, path: item.name });
					}
					if (!data.hasNext) break;
					if (
						data.objects.length === 0 ||
						typeof data.nextCursor !== 'string' ||
						!data.nextCursor ||
						seenCursors.has(data.nextCursor)
					)
						throw new Error('Incomplete Storage continuation');
					cursor = data.nextCursor;
					seenCursors.add(cursor);
				}
			}
			return files;
		},
		async removeFiles(orgId, bucket, paths) {
			const id = canonicalId(orgId);
			const expected = new Set(paths);
			if (
				!buckets.includes(bucket) ||
				!paths.length ||
				paths.length > 1000 ||
				expected.size !== paths.length ||
				paths.some((path) => !isTargetPath(path, id))
			) {
				throw new Error('Invalid cleanup batch');
			}
			const { data, error } = await supabase.storage.from(bucket).remove(paths);
			if (error) throw error;
			if (!data || data.length !== expected.size) throw new Error('Incomplete Storage removal');
			for (const item of data) {
				if (!expected.delete(item.name)) throw new Error('Unexpected Storage removal');
			}
			if (expected.size) throw new Error('Incomplete Storage removal');
		},
		async deleteConfirmedTarget(orgId, persistedName) {
			const id = canonicalId(orgId);
			const { data, error } = await supabase
				.from('organizations')
				.delete()
				.eq('id', id)
				.eq('name', persistedName)
				.select('id');
			if (error) throw error;
			return data?.length === 1 && data[0].id === id;
		}
	};
}
