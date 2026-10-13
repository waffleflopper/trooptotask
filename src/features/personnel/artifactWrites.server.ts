import { counselingRow, documentRow, followUpRow, leaderNoteRow } from './personnelArtifactRow.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { registerOrganizationFileUpload, removeRetiredOrganizationFiles } from '$features/organization/index.server';
import type { FileCleanup } from '$features/organization/contracts';
import type {
	PersonnelArtifactArchiveWriter,
	PersonnelArtifactRef,
	PersonnelArtifactWritePort,
	PersonnelArtifactWriter
} from './contracts';
import { fail } from '$lib/errors';

type ArtifactTable = 'counseling_records' | 'personnel_documents' | 'personnel_follow_ups' | 'leader_notes';
const COUNSELING_RECORDS_SELECT =
	'id,personnel_id,date_conducted,title,subject,summary,notes,uploaded_by,file_path,created_at,archived_at';
const PERSONNEL_DOCUMENTS_SELECT =
	'id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by,created_at,archived_at';
const PERSONNEL_FOLLOW_UPS_SELECT =
	'id,personnel_id,title,notes,due_date,status,created_by,created_at,updated_at,completed_at,archived_at';
const LEADER_NOTES_SELECT = 'id,personnel_id,author,text,created_at,archived_at';
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

export function artifactFileTarget(kind: 'counseling' | 'document', orgId: string, personnelId: string, path: string) {
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

interface FileDeletionReceipt {
	deleted?: boolean;
	bucket_id: string | null;
	object_name: string | null;
	file_removed: boolean;
}

export function parseFileDeletion(data: unknown): FileDeletionReceipt | null {
	if (!Array.isArray(data) || data.length === 0) return null;
	const [receipt] = data as FileDeletionReceipt[];
	if (data.length !== 1 || typeof receipt?.file_removed !== 'boolean')
		throw new Error('File artifact deletion was not acknowledged');
	return receipt;
}

/** Removes a deletion's retired bytes now when possible; scheduled cleanup owns the rest. */
export async function finishFileCleanup(admin: SupabaseClient, receipt: FileDeletionReceipt): Promise<FileCleanup> {
	if (receipt.file_removed || !receipt.bucket_id || !receipt.object_name) return 'complete';
	return removeRetiredOrganizationFiles(admin, [{ bucket_id: receipt.bucket_id, object_name: receipt.object_name }]);
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
				async setCounselingArchivedAt(id, archivedAt) {
					const { data, error } = await admin
						.from('counseling_records')
						.update({ archived_at: archivedAt })
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
				async setDocumentArchivedAt(id, archivedAt) {
					const { data, error } = await admin
						.from('personnel_documents')
						.update({ archived_at: archivedAt })
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
							...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
							...(input.archivedAt !== undefined ? { archived_at: input.archivedAt } : {}),
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
							organization_id: actor.orgId,
							personnel_id: personnelId
						})
						.select(LEADER_NOTES_SELECT)
						.single();
					if (error) throw new Error(error.message);
					return leaderNoteRow(data);
				},
				async setLeaderNoteArchivedAt(id, archivedAt) {
					const { data, error } = await admin
						.from('leader_notes')
						.update({ archived_at: archivedAt })
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
					const { data, error } = await admin.storage.from(bucket).upload(path, file, { upsert: false });
					if (error) throw new Error(`Storage upload failed: ${error.message}`);
					if (data?.path !== path || data.fullPath !== `${bucket}/${path}`)
						throw new Error('Storage upload was not acknowledged');
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
					const receipt = parseFileDeletion(data);
					if (!receipt) return null;
					return { deleted: receipt.deleted === true, fileCleanup: await finishFileCleanup(admin, receipt) };
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
		async findCounselingPersonId(actor, recordId) {
			const { data, error } = await getAdminClient()
				.from('counseling_records')
				.select('personnel_id')
				.eq('organization_id', actor.orgId)
				.eq('id', recordId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return (data?.personnel_id as string | undefined) ?? null;
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
					.order('id', { ascending: true })
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
			const listCandidates = async (
				table: ArtifactTable,
				archivedAt: string | null,
				status?: 'open'
			): Promise<PersonnelArtifactRef[]> => {
				const rows: PersonnelArtifactRef[] = [];
				for (let from = 0; ; from += 1000) {
					let query = admin
						.from(table)
						.select('id,personnel_id')
						.eq('organization_id', actor.orgId)
						.in('personnel_id', ids);
					query = archivedAt === null ? query.is('archived_at', null) : query.eq('archived_at', archivedAt);
					if (status) query = query.eq('status', status);
					const { data, error } = await query.order('id', { ascending: true }).range(from, from + 999);
					if (error) throw new Error(error.message);
					const page = data ?? [];
					rows.push(...page.map((row) => ({ id: row.id, personnelId: row.personnel_id })));
					if (page.length < 1000) return rows;
				}
			};
			const update = async (
				table: ArtifactTable,
				row: PersonnelArtifactRef,
				archivedAt: string | null,
				followUp = false
			) => {
				if (!allowed.has(row.personnelId)) fail(403, 'Artifact Person is outside the authorized batch');
				const { error } = await admin
					.from(table)
					.update({
						archived_at: archivedAt,
						...(followUp ? { status: archivedAt === null ? 'open' : 'archived' } : {})
					})
					.eq('organization_id', actor.orgId)
					.eq('personnel_id', row.personnelId)
					.eq('id', row.id);
				if (error) throw new Error(error.message);
			};
			return {
				listFollowUpArchiveCandidates: (archivedAt) =>
					listCandidates('personnel_follow_ups', archivedAt, archivedAt === null ? 'open' : undefined),
				listCounselingArchiveCandidates: (archivedAt) => listCandidates('counseling_records', archivedAt),
				listDocumentArchiveCandidates: (archivedAt) => listCandidates('personnel_documents', archivedAt),
				listLeaderNoteArchiveCandidates: (archivedAt) => listCandidates('leader_notes', archivedAt),
				setFollowUpArchivedState: (row, archivedAt) => update('personnel_follow_ups', row, archivedAt, true),
				setCounselingArchivedAt: (row, archivedAt) => update('counseling_records', row, archivedAt),
				setDocumentArchivedAt: (row, archivedAt) => update('personnel_documents', row, archivedAt),
				setLeaderNoteArchivedAt: (row, archivedAt) => update('leader_notes', row, archivedAt)
			};
		}
	};
}
