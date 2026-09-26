import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import type {
	PersonnelArtifactArchiveWriter,
	PersonnelArtifactRef,
	PersonnelArtifactTable,
	PersonnelArtifactWritePort,
	PersonnelArtifactWriter
} from './contracts';

const ARTIFACT_TABLES: ReadonlySet<string> = new Set([
	'personnel_follow_ups',
	'counseling_records',
	'personnel_documents',
	'leader_notes'
]);

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

function assertArtifactPatch(patch: Record<string, unknown>): void {
	if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
		fail(400, 'Artifact identity cannot be changed');
	}
}

function assertArtifactInsert(data: Record<string, unknown>): void {
	if ('organization_id' in data || 'personnel_id' in data) {
		fail(400, 'Artifact Person is bound by the write session');
	}
}

function assertArtifactTable(table: string): void {
	if (!ARTIFACT_TABLES.has(table)) fail(400, 'Unsupported Personnel artifact table');
}

function artifactFileTarget(kind: 'counseling' | 'document', orgId: string, personnelId: string, path: string) {
	const prefix =
		kind === 'counseling'
			? `${orgId}/counseling-records/${personnelId}/`
			: `${orgId}/personnel/${personnelId}/documents/`;
	if (
		!path.startsWith(prefix) ||
		path.length === prefix.length ||
		path.split('/').some((part) => part === '..' || part === '.')
	) {
		fail(400, 'Artifact file path is outside the authorized Person');
	}
	return kind === 'counseling' ? SENSITIVE_FILE_BUCKET : 'personnel-documents';
}

/** Bind service-role operations to a Person only after the request actor is admitted. */
export function createSupabasePersonnelArtifactWritePort(
	requestClient: SupabaseClient,
	getAdminClient: () => SupabaseClient
): PersonnelArtifactWritePort {
	return {
		async forPerson(actor, personnelId): Promise<PersonnelArtifactWriter> {
			const { data: person, error } = await requestClient
				.from('personnel')
				.select('group_id')
				.eq('organization_id', actor.orgId)
				.eq('id', personnelId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!person) fail(404, 'Personnel record not found');

			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(person.group_id),
				'personnel',
				personnelId
			);
			const admin = getAdminClient();
			const base = (table: PersonnelArtifactTable) => {
				assertArtifactTable(table);
				return admin.from(table).select('*').eq('organization_id', actor.orgId).eq('personnel_id', personnelId);
			};

			const writer: PersonnelArtifactWriter = {
				async find<T>(table: PersonnelArtifactTable, id: string) {
					const { data, error } = await base(table).eq('id', id).maybeSingle();
					if (error) throw new Error(error.message);
					return (data as T | null) ?? null;
				},
				async insert<T>(table: PersonnelArtifactTable, data: Record<string, unknown>) {
					assertArtifactTable(table);
					assertArtifactInsert(data);
					const { data: inserted, error } = await admin
						.from(table)
						.insert({ ...data, organization_id: actor.orgId, personnel_id: personnelId })
						.select('*')
						.single();
					if (error) throw new Error(error.message);
					return inserted as T;
				},
				async update<T>(table: PersonnelArtifactTable, id: string, patch: Record<string, unknown>) {
					assertArtifactTable(table);
					assertArtifactPatch(patch);
					const { data, error } = await admin
						.from(table)
						.update(patch)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select('*')
						.single();
					if (error) throw new Error(error.message);
					return data as T;
				},
				async delete(table, id) {
					assertArtifactTable(table);
					const { error } = await admin
						.from(table)
						.delete()
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id);
					if (error) throw new Error(error.message);
				},
				async sumActiveDocumentBytes() {
					const result = await selectAllSupabaseRows<{ file_size_bytes: number }>(async (from, to) => {
						const { data, error } = await admin
							.from('personnel_documents')
							.select('file_size_bytes')
							.eq('organization_id', actor.orgId)
							.eq('personnel_id', personnelId)
							.is('archived_at', null)
							.range(from, to);
						return { data, error };
					});
					if (result.error)
						throw new Error((result.error as { message?: string }).message ?? 'Document usage read failed');
					return (result.data ?? []).reduce((sum, row) => sum + (row.file_size_bytes ?? 0), 0);
				},
				async uploadFile(kind, path, file) {
					if (!(file instanceof File)) fail(400, 'An artifact file is required');
					const bucket = artifactFileTarget(kind, actor.orgId, personnelId, path);
					const { error } = await admin.storage.from(bucket).upload(path, file, { upsert: false });
					if (error) throw new Error(`Storage upload failed: ${error.message}`);
				},
				async removeFile(kind, path) {
					const bucket = artifactFileTarget(kind, actor.orgId, personnelId, path);
					const { error } = await admin.storage.from(bucket).remove([path]);
					if (error) throw new Error(`Storage remove failed: ${error.message}`);
				}
			};
			return writer;
		},
		async forPeople(actor, personnelIds, action): Promise<PersonnelArtifactArchiveWriter> {
			const ids = [...new Set(personnelIds)];
			if (ids.length === 0) fail(400, 'At least one Person is required');
			const result = await selectAllSupabaseRows<{ id: string; group_id: string | null }>(async (from, to) => {
				const { data, error } = await requestClient
					.from('personnel')
					.select('id, group_id')
					.eq('organization_id', actor.orgId)
					.in('id', ids)
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message?: string }).message ?? 'Personnel lookup failed');
			const people = result.data ?? [];
			if (people.length !== ids.length) fail(404, 'Personnel record not found');
			for (const person of people) {
				await requireFeaturePolicy(
					{ auth: actor },
					action === 'archive'
						? POLICY_ACTION_CATALOG.personnel.archiveRecords
						: POLICY_ACTION_CATALOG.personnel.restoreRecords,
					policyResourceForGroup(person.group_id),
					'personnel',
					person.id
				);
			}
			const allowed = new Set(ids);
			const admin = getAdminClient();
			return {
				async listCandidates(table, options): Promise<PersonnelArtifactRef[]> {
					assertArtifactTable(table);
					const rows = await selectAllSupabaseRows<{ id: string; personnel_id: string }>(async (from, to) => {
						let query = admin
							.from(table)
							.select('id, personnel_id')
							.eq('organization_id', actor.orgId)
							.in('personnel_id', ids);
						query =
							options.archivedAt === null ? query.is('archived_at', null) : query.eq('archived_at', options.archivedAt);
						if (options.status) query = query.eq('status', options.status);
						const { data, error } = await query.range(from, to);
						return { data, error };
					});
					if (rows.error) throw new Error((rows.error as { message?: string }).message ?? 'Artifact lookup failed');
					return (rows.data ?? []).map((row) => ({ id: row.id, personnelId: row.personnel_id }));
				},
				async update(table, row, patch) {
					assertArtifactTable(table);
					assertArtifactPatch(patch);
					if (!allowed.has(row.personnelId)) fail(403, 'Artifact Person is outside the authorized batch');
					const { error } = await admin
						.from(table)
						.update(patch)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', row.personnelId)
						.eq('id', row.id);
					if (error) throw new Error(error.message);
				}
			};
		}
	};
}
