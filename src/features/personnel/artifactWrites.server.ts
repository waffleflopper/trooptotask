import { counselingRow, documentRow, followUpRow, leaderNoteRow } from './personnelArtifactRow.server';
import type { SupabaseClient } from '$lib/server/database';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import {
	registerOrganizationFileUpload,
	removeRetiredOrganizationFiles,
	type RetiredOrganizationFile
} from '$features/organization/index.server';
import type { FileCleanup } from '$features/organization/contracts';
import type { PersonnelArtifactWritePort, PersonnelArtifactWriter } from './contracts';
import { fail } from '$lib/errors';

type ArtifactTable = 'counseling_records' | 'personnel_documents' | 'personnel_follow_ups' | 'leader_notes';
const COUNSELING_RECORDS_SELECT =
	'id,personnel_id,date_conducted,title,subject,summary,notes,uploaded_by,conducted_by,file_path,created_at,archived_at,archived_by';
const PERSONNEL_DOCUMENTS_SELECT =
	'id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by,created_at,archived_at,archived_by';
const PERSONNEL_FOLLOW_UPS_SELECT =
	'id,personnel_id,title,notes,due_date,status,created_by,created_at,updated_at,completed_at,completed_by,archived_at,archived_by';
const LEADER_NOTES_SELECT = 'id,personnel_id,author,text,created_at,updated_at,archived_at,archived_by';
const ARTIFACT_TABLES: ReadonlySet<string> = new Set([
	'personnel_follow_ups',
	'counseling_records',
	'personnel_documents',
	'leader_notes'
]);

function assertArtifactPatch(patch: object): void {
	if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
		fail(400, 'Artifact identity cannot be changed');
	}
}

function assertArtifactInsert(data: object): void {
	if ('organization_id' in data || 'personnel_id' in data) {
		fail(400, 'Artifact Person is bound by the write session');
	}
}

function assertArtifactTable(table: string): void {
	if (!ARTIFACT_TABLES.has(table)) fail(400, 'Unsupported Personnel artifact table');
}

type ArtifactFileKind = 'counseling' | 'document';

function artifactFileOwned(kind: ArtifactFileKind, orgId: string, personnelId: string, path: string): boolean {
	const prefix =
		kind === 'counseling'
			? `${orgId}/counseling-records/${personnelId}/`
			: `${orgId}/personnel/${personnelId}/documents/`;
	return (
		path.startsWith(prefix) &&
		path.length > prefix.length &&
		!path.split('/').some((part) => part === '..' || part === '.')
	);
}

const artifactBucket = (kind: ArtifactFileKind) =>
	kind === 'counseling' ? SENSITIVE_FILE_BUCKET : 'personnel-documents';

export function artifactFileTarget(kind: ArtifactFileKind, orgId: string, personnelId: string, path: string) {
	if (!artifactFileOwned(kind, orgId, personnelId, path))
		fail(400, 'Artifact file path is outside the authorized Person');
	return artifactBucket(kind);
}

interface FileDeletionOwner {
	kind: ArtifactFileKind;
	orgId: string;
	personnelId: string;
	/** The deleted artifact's file path when known; null when it had none. */
	expectedPath?: string | null;
}

export interface FileDeletion {
	/** Null when the RPC reports no `deleted` column. */
	deleted: boolean | null;
	/** The owned key still holding bytes, or null when nothing remains to remove. */
	retired: RetiredOrganizationFile | null;
}

/** Accepts only receipt rows the SQL can emit for this owner; null only for no receipt. */
export function parseFileDeletion(data: unknown, owner: FileDeletionOwner): FileDeletion | null {
	if (Array.isArray(data) && data.length === 0) return null;
	const row: unknown = Array.isArray(data) && data.length === 1 ? data[0] : null;
	if (typeof row !== 'object' || row === null) throw new Error('File artifact deletion was not acknowledged');
	const { deleted = null, bucket_id: bucket, object_name: key, file_removed: removed } = row as Record<string, unknown>;
	const expectedBucket = artifactBucket(owner.kind);
	if (deleted === null || typeof deleted === 'boolean') {
		if (removed === true && key === null && (bucket === null || bucket === expectedBucket))
			return { deleted, retired: null };
		// SQL derives owned prefixes from uuid::text, which is lowercase whatever the route casing.
		if (
			removed === false &&
			bucket === expectedBucket &&
			typeof key === 'string' &&
			artifactFileOwned(owner.kind, owner.orgId.toLowerCase(), owner.personnelId.toLowerCase(), key) &&
			(owner.expectedPath === undefined || key === owner.expectedPath)
		)
			return { deleted, retired: { bucket_id: expectedBucket, object_name: key } };
	}
	throw new Error('File artifact deletion was not acknowledged');
}

/** Removes a deletion's retired bytes now when possible; scheduled cleanup owns the rest. */
export async function finishFileCleanup(admin: SupabaseClient, deletion: FileDeletion): Promise<FileCleanup> {
	return deletion.retired ? removeRetiredOrganizationFiles(admin, [deletion.retired]) : 'complete';
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
			const base = (table: ArtifactTable) => {
				assertArtifactTable(table);
				return admin.from(table);
			};

			const writer: PersonnelArtifactWriter = {
				async findCounseling(id) {
					const { data, error } = await base('counseling_records')
						.select(COUNSELING_RECORDS_SELECT)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.maybeSingle();
					if (error) throw new Error(error.message);
					return data ? counselingRow(data) : null;
				},
				async createCounseling(input) {
					assertArtifactInsert(input);
					const { data, error } = await admin
						.from('counseling_records')
						.insert({
							date_conducted: input.dateConducted,
							title: input.title,
							subject: input.title,
							summary: input.summary,
							notes: input.summary,
							conducted_by: input.conductedBy,
							uploaded_by: input.uploadedBy,
							file_path: input.filePath,
							status: 'completed',
							created_at: input.createdAt,
							organization_id: actor.orgId,
							personnel_id: personnelId
						})
						.select(COUNSELING_RECORDS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return counselingRow(data);
				},
				async setCounselingArchive(id, archived) {
					const { data, error } = await admin
						.from('counseling_records')
						.update({ archived_at: archived?.at ?? null, archived_by: archived?.by ?? null })
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select(COUNSELING_RECORDS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return counselingRow(data);
				},
				async findDocument(id) {
					const { data, error } = await base('personnel_documents')
						.select(PERSONNEL_DOCUMENTS_SELECT)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.maybeSingle();
					if (error) throw new Error(error.message);
					return data ? documentRow(data) : null;
				},
				async createDocument(input) {
					assertArtifactInsert(input);
					const { data, error } = await admin
						.from('personnel_documents')
						.insert({
							title: input.title,
							file_path: input.filePath,
							file_size_bytes: input.fileSizeBytes,
							content_type: input.contentType,
							uploaded_by: input.uploadedBy,
							created_at: input.createdAt,
							organization_id: actor.orgId,
							personnel_id: personnelId
						})
						.select(PERSONNEL_DOCUMENTS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return documentRow(data);
				},
				async setDocumentArchive(id, archived) {
					const { data, error } = await admin
						.from('personnel_documents')
						.update({ archived_at: archived?.at ?? null, archived_by: archived?.by ?? null })
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select(PERSONNEL_DOCUMENTS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return documentRow(data);
				},
				async findFollowUp(id) {
					const { data, error } = await base('personnel_follow_ups')
						.select(PERSONNEL_FOLLOW_UPS_SELECT)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.maybeSingle();
					if (error) throw new Error(error.message);
					return data ? followUpRow(data) : null;
				},
				async createFollowUp(input) {
					assertArtifactInsert(input);
					const { data, error } = await admin
						.from('personnel_follow_ups')
						.insert({
							title: input.title,
							notes: input.notes,
							due_date: input.dueDate,
							status: 'open',
							created_by: input.createdBy,
							created_at: input.createdAt,
							updated_at: input.updatedAt,
							organization_id: actor.orgId,
							personnel_id: personnelId
						})
						.select(PERSONNEL_FOLLOW_UPS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return followUpRow(data);
				},
				async patchFollowUp(id, input) {
					assertArtifactPatch(input);
					const { data, error } = await admin
						.from('personnel_follow_ups')
						.update({
							...(input.title !== undefined ? { title: input.title } : {}),
							...(input.notes !== undefined ? { notes: input.notes } : {}),
							...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
							...(input.status !== undefined ? { status: input.status } : {}),
							...(input.completed !== undefined
								? { completed_at: input.completed?.at ?? null, completed_by: input.completed?.by ?? null }
								: {}),
							...(input.archived !== undefined
								? { archived_at: input.archived?.at ?? null, archived_by: input.archived?.by ?? null }
								: {}),
							updated_at: input.updatedAt
						})
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select(PERSONNEL_FOLLOW_UPS_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return followUpRow(data);
				},
				async deleteFollowUp(id) {
					const { error } = await admin
						.from('personnel_follow_ups')
						.delete()
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id);
					if (error) throw new Error(error.message);
				},
				async findLeaderNote(id) {
					const { data, error } = await base('leader_notes')
						.select(LEADER_NOTES_SELECT)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.maybeSingle();
					if (error) throw new Error(error.message);
					return data ? leaderNoteRow(data) : null;
				},
				async createLeaderNote(input) {
					assertArtifactInsert(input);
					const { data, error } = await admin
						.from('leader_notes')
						.insert({
							author: input.author,
							text: input.text,
							created_at: input.createdAt,
							updated_at: input.createdAt,
							organization_id: actor.orgId,
							personnel_id: personnelId
						})
						.select(LEADER_NOTES_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return leaderNoteRow(data);
				},
				async setLeaderNoteArchive(id, archived) {
					const { data, error } = await admin
						.from('leader_notes')
						.update({ archived_at: archived?.at ?? null, archived_by: archived?.by ?? null })
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select(LEADER_NOTES_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return leaderNoteRow(data);
				},
				async setLeaderNoteText(id, text, updatedAt) {
					const { data, error } = await admin
						.from('leader_notes')
						.update({ text, updated_at: updatedAt })
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select(LEADER_NOTES_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return leaderNoteRow(data);
				},
				async deleteLeaderNote(id) {
					const { error } = await admin
						.from('leader_notes')
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
							.order('id', { ascending: true })
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
					const registration = await registerOrganizationFileUpload(admin, {
						orgId: actor.orgId,
						userId: actor.userId,
						bucket,
						path
					});
					try {
						const { data, error } = await admin.storage.from(bucket).upload(path, file, { upsert: false });
						if (error) throw new Error(`Storage upload failed: ${error.message}`);
						if (data?.path !== path || data.fullPath !== `${bucket}/${path}`)
							throw new Error('Storage upload was not acknowledged');
					} catch (error) {
						// A failed upload may still have stored bytes; retire the key before releasing the registration.
						await writer.reconcileFileAttachment(kind, path);
						await registration.complete();
						throw error;
					}
					return registration;
				},
				async deleteArchivedFileArtifact(kind, id, archivedAt) {
					const { data, error } = await admin.rpc('delete_archived_personnel_artifact', {
						p_organization_id: actor.orgId,
						p_personnel_id: personnelId,
						p_kind: kind,
						p_artifact_id: id,
						p_archived_at: archivedAt
					});
					if (error) throw new Error(error.message);
					const deletion = parseFileDeletion(data, { kind, orgId: actor.orgId, personnelId });
					if (!deletion) return null;
					if (deletion.deleted === null) throw new Error('File artifact deletion was not acknowledged');
					return { deleted: deletion.deleted, fileCleanup: await finishFileCleanup(admin, deletion) };
				},
				async reconcileFileAttachment(kind, path) {
					const bucket = artifactFileTarget(kind, actor.orgId, personnelId, path);
					const { data, error } = await admin.rpc('reconcile_personnel_file_attachment', {
						p_organization_id: actor.orgId,
						p_personnel_id: personnelId,
						p_kind: kind,
						p_object_name: path
					});
					if (error) throw new Error(error.message);
					if (typeof data === 'string' && data) return data;
					if (data !== null) throw new Error('File attachment reconciliation was not acknowledged');
					await removeRetiredOrganizationFiles(admin, [{ bucket_id: bucket, object_name: path }]);
					return null;
				}
			};
			return writer;
		},
		async createFollowUps(actor, personnelIds, entry) {
			if (personnelIds.length === 0) return [];
			const { data, error } = await getAdminClient()
				.from('personnel_follow_ups')
				.insert(
					personnelIds.map((personnelId) => ({
						title: entry.title,
						notes: entry.notes,
						due_date: entry.dueDate,
						status: 'open',
						created_by: entry.createdBy,
						created_at: entry.createdAt,
						updated_at: entry.createdAt,
						organization_id: actor.orgId,
						personnel_id: personnelId
					}))
				)
				.select('personnel_id')
				.returns<{ personnel_id: string }[]>();
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => row.personnel_id);
		},
		async createLeaderNotes(actor, personnelIds, entry) {
			if (personnelIds.length === 0) return [];
			const { data, error } = await getAdminClient()
				.from('leader_notes')
				.insert(
					personnelIds.map((personnelId) => ({
						author: entry.author,
						text: entry.text,
						created_at: entry.createdAt,
						updated_at: entry.createdAt,
						organization_id: actor.orgId,
						personnel_id: personnelId
					}))
				)
				.select('personnel_id')
				.returns<{ personnel_id: string }[]>();
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => row.personnel_id);
		},
		async findCounselingPersonId(actor, recordId) {
			const { data, error } = await getAdminClient()
				.from('counseling_records')
				.select('personnel_id')
				.eq('organization_id', actor.orgId)
				.eq('id', recordId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return (data?.personnel_id as string | undefined) ?? null;
		}
	};
}
