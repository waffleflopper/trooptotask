import { z } from 'zod';
import type { PersonnelCounselingRecord } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { hasPdfFileSignature } from '$lib/storage/fileSignatures';
import {
	buildSensitiveFilePath,
	SENSITIVE_FILE_BUCKET,
	validateSensitiveFileSelection
} from '$lib/storage/sensitiveFiles';
import {
	archiveArtifact,
	deleteArtifact,
	listArtifacts,
	loadPersonnelContributorLabels,
	mapCounselingRow,
	PERSONNEL_COUNSELING_RECORD_SPEC,
	personnelArtifactWriter,
	restoreArtifact,
	type CounselingRecordRow
} from './personnelArtifactLifecycle';

export const COUNSELING_RECORDS_BUCKET = SENSITIVE_FILE_BUCKET;

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
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelCounselingRecord[]> {
	return listArtifacts(ctx, PERSONNEL_COUNSELING_RECORD_SPEC, personnelId, { limit, archived: options.archived });
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
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const filename = safeFilename(rawInput.file.name);
	const filePath = buildSensitiveFilePath({
		orgId: ctx.auth.orgId,
		scope: 'counseling-records',
		recordId: input.personnelId,
		filename: `${crypto.randomUUID()}-${filename}`
	});
	await writer.uploadFile('counseling', filePath, rawInput.file);

	let row: CounselingRecordRow;
	try {
		row = await writer.insert<CounselingRecordRow>('counseling_records', {
			date_conducted: input.dateConducted,
			title: input.title,
			subject: input.title,
			summary: input.summary || null,
			notes: input.summary || null,
			uploaded_by: ctx.auth.userId,
			file_path: filePath,
			status: 'completed',
			created_at: new Date().toISOString()
		});
	} catch (error) {
		await writer.removeFile('counseling', filePath);
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

export async function archivePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelCounselingRecord> {
	return archiveArtifact(ctx, PERSONNEL_COUNSELING_RECORD_SPEC, { personnelId: input.personnelId, id: input.recordId });
}

export async function restorePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<PersonnelCounselingRecord> {
	return restoreArtifact(ctx, PERSONNEL_COUNSELING_RECORD_SPEC, { personnelId: input.personnelId, id: input.recordId });
}

export async function deletePersonnelCounselingRecord(
	ctx: UseCaseContext,
	input: { personnelId: string; recordId: string }
): Promise<void> {
	return deleteArtifact(
		ctx,
		PERSONNEL_COUNSELING_RECORD_SPEC,
		{ personnelId: input.personnelId, id: input.recordId },
		{
			onDeleted: async (row, writer) => {
				if (row.file_path) await writer.removeFile('counseling', row.file_path);
			}
		}
	);
}
