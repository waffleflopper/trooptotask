import { z } from 'zod';
import type {
	PersonnelArtifactArchiveState,
	PersonnelArtifactWritePort,
	PersonnelCounselingRecord,
	PersonnelRecordPersistence
} from './contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { FileCleanup } from '$features/organization/contracts';
import { hasPdfFileSignature } from '$lib/storage/fileSignatures';
import { buildSensitiveFilePath, validateSensitiveFileSelection } from '$lib/storage/sensitiveFiles';
import {
	personnelArtifactWriter,
	requirePersonnelArtifactAccess,
	resolveContributorLabel,
	type PersonnelArtifactsContext,
	type CounselingRecordRow
} from './personnelArtifactContext.server';

export interface PersonnelCounselingRecordInput {
	personnelId: string;
	dateConducted: string;
	title: string;
	summary?: string;
	file: File;
}

const counselingInputSchema = z.object({
	personnelId: z.string().min(1),
	dateConducted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
	title: z.string().trim().min(1, 'Title is required').max(160),
	summary: z.string().trim().max(500).optional().default('')
});

async function assertPdf(file: File): Promise<void> {
	if (!(file instanceof File)) fail(400, 'A signed counseling PDF is required.');
	const validationError = validateSensitiveFileSelection(file);
	if (validationError) fail(400, validationError);
	const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
	if (!hasPdfFileSignature(bytes)) fail(400, 'Counseling upload contents must be a PDF file.');
}

function safeFilename(filename: string): string {
	const fallback = 'counseling-record.pdf';
	const cleaned = filename
		.split(/[\\/]/)
		.pop()
		?.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return cleaned || fallback;
}

export async function listPersonnelCounselingRecords(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelCounselingRecord[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId, 'read');
	const rows = await ctx.persistence.listCounselingRecords(personnelId, { archived: !!options.archived, limit });
	const labels = await ctx.contributorLabels(rows.flatMap((row) => (row.uploaded_by ? [row.uploaded_by] : [])));
	return rows.map((row) => mapCounselingRow(row, labels));
}

export async function createPersonnelCounselingRecord(
	ctx: PersonnelArtifactsContext,
	rawInput: PersonnelCounselingRecordInput
): Promise<PersonnelCounselingRecord> {
	const parsed = counselingInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	if (!rawInput.file) fail(400, 'A signed counseling PDF is required.');
	await assertPdf(rawInput.file);

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const filename = safeFilename(rawInput.file.name);
	const filePath = buildSensitiveFilePath({
		orgId: ctx.actor.orgId,
		scope: 'counseling-records',
		recordId: input.personnelId,
		filename: `${crypto.randomUUID()}-${filename}`
	});
	const upload = await writer.uploadFile('counseling', filePath, rawInput.file);

	let row: CounselingRecordRow | null;
	try {
		row = await writer.createCounseling({
			dateConducted: input.dateConducted,
			title: input.title,
			summary: input.summary || null,
			uploadedBy: ctx.actor.userId,
			filePath: filePath,
			createdAt: new Date().toISOString()
		});
		if (
			!row ||
			typeof row.id !== 'string' ||
			!row.id ||
			row.personnel_id !== input.personnelId ||
			row.file_path !== filePath
		)
			throw new Error('Uploaded artifact attachment was not acknowledged');
	} catch (error) {
		const attachedId = await writer.reconcileFileAttachment('counseling', filePath);
		row = attachedId ? await writer.findCounseling(attachedId) : null;
		if (!row) {
			await upload.complete();
			throw error;
		}
	}
	await upload.complete();

	ctx.audit.log({
		action: 'personnel.counseling_record.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await ctx.contributorLabels(row.uploaded_by ? [row.uploaded_by] : []);
	return mapCounselingRow(row, labels);
}

async function loadCounselingForWrite(ctx: PersonnelArtifactsContext, personnelId: string, id: string) {
	const writer = await personnelArtifactWriter(ctx, personnelId);
	const row = await writer.findCounseling(id);
	if (!row) fail(404, 'Counseling record not found');
	return { writer, row };
}

export async function archivePersonnelCounselingRecord(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelArtifactArchiveState> {
	const { writer, row: existing } = await loadCounselingForWrite(ctx, input.personnelId, input.recordId);
	if (existing.archived_at) fail(409, 'Counseling record is already archived');
	const row = await writer.setCounselingArchivedAt(input.recordId, new Date().toISOString());
	ctx.audit.log({
		action: 'personnel.counseling_record.archived',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});
	return { id: row.id, archivedAt: row.archived_at ?? null };
}

export async function restorePersonnelCounselingRecord(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelArtifactArchiveState> {
	const { writer } = await loadCounselingForWrite(ctx, input.personnelId, input.recordId);
	const row = await writer.setCounselingArchivedAt(input.recordId, null);
	ctx.audit.log({
		action: 'personnel.counseling_record.restored',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});
	return { id: row.id, archivedAt: row.archived_at ?? null };
}

export async function deletePersonnelCounselingRecord(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; recordId: string }
): Promise<{ fileCleanup: FileCleanup }> {
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const row = await writer.findCounseling(input.recordId);
	if (row && !row.archived_at) fail(409, 'Archive counseling records before deleting them');
	const result = await writer.deleteArchivedFileArtifact('counseling', input.recordId, row?.archived_at ?? null);
	if (!result)
		fail(row ? 409 : 404, row ? 'Counseling record changed before it was deleted' : 'Counseling record not found');
	if (result.deleted)
		ctx.audit.log({
			action: 'personnel.counseling_record.deleted',
			resourceType: 'personnel',
			resourceId: input.personnelId
		});
	return { fileCleanup: result.fileCleanup };
}

/** Describes a deletion request from the counseling record of a Person the requester may manage. */
export async function describeCounselingDeletionRequest(
	ctx: {
		auth: OrganizationAccessGrant;
		audit: PolicyAuditSink;
		personnel: Pick<PersonnelRecordPersistence, 'findWriteReference'>;
		personnelArtifactWrites: Pick<PersonnelArtifactWritePort, 'findCounselingPersonId'>;
	},
	id: string
): Promise<{ description: string; url: string }> {
	const action = POLICY_ACTION_CATALOG.personnel.manageRecords;
	await requireFeaturePolicy(ctx, action, { kind: 'unscoped' }, 'counseling_record', id);
	const personnelId = await ctx.personnelArtifactWrites.findCounselingPersonId(ctx.auth, id);
	// The scoped Personnel read hides an out-of-scope Person like a missing record.
	const person = personnelId ? await ctx.personnel.findWriteReference(personnelId) : null;
	if (!person) fail(404, 'Counseling record not found');
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(person.groupId), 'counseling_record', id);
	return {
		description: `Counseling record for ${person.rank} ${person.lastName}`,
		url: `/org/${ctx.auth.orgId}/personnel`
	};
}

function fileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() ?? 'document';
}

function mapCounselingRow(
	row: CounselingRecordRow,
	contributorLabels = new Map<string, string>()
): PersonnelCounselingRecord {
	const title = row.title ?? row.subject ?? 'Uploaded counseling PDF';
	const summary = row.summary ?? row.notes ?? undefined;
	const createdAt = row.created_at ?? `${row.date_conducted}T00:00:00Z`;
	return {
		id: row.id,
		personnelId: row.personnel_id,
		dateConducted: row.date_conducted,
		title,
		summary: summary || undefined,
		status: row.archived_at ? 'archived' : row.file_path ? 'uploaded' : 'needs-title',
		uploadedBy: resolveContributorLabel(contributorLabels, row.uploaded_by ?? 'Leader upload'),
		fileName: row.file_path ? fileNameFromPath(row.file_path) : `${row.id}.pdf`,
		createdAt,
		archivedAt: row.archived_at ?? null
	};
}
