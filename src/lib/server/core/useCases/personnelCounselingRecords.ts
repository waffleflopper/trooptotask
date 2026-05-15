import { z } from 'zod';
import type { PersonnelCounselingRecord } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	buildSensitiveFilePath,
	SENSITIVE_FILE_BUCKET,
	validateSensitiveFileSelection
} from '$lib/storage/sensitiveFiles';
import { requirePersonnelArtifactAccess } from './personnelArtifactAuthorization';
import { loadPersonnelContributorLabels, resolveContributorLabel } from './personnelContributorLabels';

export const COUNSELING_RECORDS_BUCKET = SENSITIVE_FILE_BUCKET;

interface CounselingRecordRow {
	id: string;
	personnel_id: string;
	date_conducted: string;
	title?: string | null;
	subject?: string | null;
	summary?: string | null;
	notes?: string | null;
	uploaded_by?: string | null;
	file_path: string | null;
	created_at?: string | null;
	archived_at?: string | null;
}

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

function fileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() ?? 'counseling-record.pdf';
}

function hasPdfSignature(bytes: Uint8Array): boolean {
	return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function assertPdf(file: File): Promise<void> {
	if (!(file instanceof File)) fail(400, 'A signed counseling PDF is required.');
	const validationError = validateSensitiveFileSelection(file);
	if (validationError) fail(400, validationError);
	const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
	if (!hasPdfSignature(bytes)) fail(400, 'Counseling upload contents must be a PDF file.');
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
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelCounselingRecord[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId);
	const rows = await ctx.store.findMany<CounselingRecordRow>(
		'counseling_records',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [
				{ column: 'date_conducted', ascending: false },
				{ column: 'created_at', ascending: false }
			],
			isNull: { archived_at: !options.archived },
			limit
		}
	);
	const labels = await loadPersonnelContributorLabels(
		ctx,
		rows.map((row) => row.uploaded_by)
	);
	return rows.map((row) => mapCounselingRow(row, labels));
}

export async function createPersonnelCounselingRecord(
	ctx: UseCaseContext,
	rawInput: PersonnelCounselingRecordInput
): Promise<PersonnelCounselingRecord> {
	const parsed = counselingInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	if (!rawInput.file) fail(400, 'A signed counseling PDF is required.');
	await assertPdf(rawInput.file);

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);

	const filename = safeFilename(rawInput.file.name);
	const filePath = buildSensitiveFilePath({
		orgId: ctx.auth.orgId,
		scope: 'counseling-records',
		recordId: input.personnelId,
		filename: `${crypto.randomUUID()}-${filename}`
	});
	await ctx.storage.upload(COUNSELING_RECORDS_BUCKET, filePath, rawInput.file);

	let row: CounselingRecordRow;
	try {
		row = await ctx.store.insert<CounselingRecordRow>('counseling_records', ctx.auth.orgId, {
			personnel_id: input.personnelId,
			date_conducted: input.dateConducted,
			title: input.title,
			subject: input.title,
			summary: input.summary || null,
			notes: input.summary || null,
			uploaded_by: ctx.auth.userId ?? 'Unknown leader',
			file_path: filePath,
			status: 'completed',
			created_at: new Date().toISOString()
		});
	} catch (error) {
		await ctx.storage.remove(COUNSELING_RECORDS_BUCKET, [filePath]);
		throw error;
	}

	ctx.audit.log({
		action: 'personnel.counseling_record.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapCounselingRow(row, labels);
}

async function loadCounselingRecord(
	ctx: UseCaseContext,
	personnelId: string,
	recordId: string
): Promise<CounselingRecordRow> {
	await requirePersonnelArtifactAccess(ctx, personnelId);
	const row = await ctx.store.findOne<CounselingRecordRow>('counseling_records', ctx.auth.orgId, {
		id: recordId,
		personnel_id: personnelId
	});
	if (!row) fail(404, 'Counseling record not found');
	return row;
}

export async function archivePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelCounselingRecord> {
	const existing = await loadCounselingRecord(ctx, input.personnelId, input.recordId);
	if (existing.archived_at) fail(409, 'Counseling record is already archived');
	const row = await ctx.store.update<CounselingRecordRow>('counseling_records', ctx.auth.orgId, input.recordId, {
		archived_at: new Date().toISOString()
	});
	ctx.audit.log({
		action: 'personnel.counseling_record.archived',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});
	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapCounselingRow(row, labels);
}

export async function restorePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelCounselingRecord> {
	await loadCounselingRecord(ctx, input.personnelId, input.recordId);
	const row = await ctx.store.update<CounselingRecordRow>('counseling_records', ctx.auth.orgId, input.recordId, {
		archived_at: null
	});
	ctx.audit.log({
		action: 'personnel.counseling_record.restored',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});
	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapCounselingRow(row, labels);
}

export async function deletePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<void> {
	const row = await loadCounselingRecord(ctx, input.personnelId, input.recordId);
	if (!row.archived_at) fail(409, 'Archive counseling records before deleting them');
	await ctx.store.delete('counseling_records', ctx.auth.orgId, input.recordId);
	if (row.file_path) await ctx.storage.remove(COUNSELING_RECORDS_BUCKET, [row.file_path]);
	ctx.audit.log({
		action: 'personnel.counseling_record.deleted',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});
}
