import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelCounselingRecord } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { SENSITIVE_FILE_BUCKET, validateSensitiveFileSelection } from '$lib/storage/sensitiveFiles';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

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

function mapCounselingRow(row: CounselingRecordRow): PersonnelCounselingRecord {
	const title = row.title ?? row.subject ?? 'Uploaded counseling PDF';
	const summary = row.summary ?? row.notes ?? undefined;
	const createdAt = row.created_at ?? `${row.date_conducted}T00:00:00Z`;
	return {
		id: row.id,
		personnelId: row.personnel_id,
		dateConducted: row.date_conducted,
		title,
		summary: summary || undefined,
		status: row.file_path ? 'uploaded' : 'needs-title',
		uploadedBy: row.uploaded_by ?? 'Leader upload',
		filePath: row.file_path ?? `pending-upload/${row.id}.pdf`,
		createdAt
	};
}

async function requirePersonnelOperate(ctx: UseCaseContext, personnelId: string): Promise<void> {
	const person = await (ctx.rawStore ?? ctx.store).findOne<{ id: string }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'id'
	);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		await policyResourceForPersonnel(ctx, personnelId),
		'personnel',
		personnelId
	);
	await ctx.auth.requireGroupAccess(personnelId);
}

function assertPdf(file: File): void {
	if (!(file instanceof File)) fail(400, 'A signed counseling PDF is required.');
	const validationError = validateSensitiveFileSelection(file);
	if (validationError) fail(400, validationError);
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
	limit?: number
): Promise<PersonnelCounselingRecord[]> {
	await requirePersonnelOperate(ctx, personnelId);
	const rows = await ctx.store.findMany<CounselingRecordRow>(
		'counseling_records',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [
				{ column: 'date_conducted', ascending: false },
				{ column: 'created_at', ascending: false }
			],
			limit
		}
	);
	return rows.map(mapCounselingRow);
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
	assertPdf(rawInput.file);

	const input = parsed.data;
	await requirePersonnelOperate(ctx, input.personnelId);

	const filename = safeFilename(rawInput.file.name);
	const filePath = `${ctx.auth.orgId}/personnel/${input.personnelId}/counseling-records/${crypto.randomUUID()}-${filename}`;
	await ctx.storage.upload(COUNSELING_RECORDS_BUCKET, filePath, rawInput.file);

	const row = await ctx.store.insert<CounselingRecordRow>('counseling_records', ctx.auth.orgId, {
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

	ctx.audit.log({
		action: 'personnel.counseling_record.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	return mapCounselingRow(row);
}
