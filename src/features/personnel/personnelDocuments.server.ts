import { z } from 'zod';
import type { PersonnelDocument } from './contracts';
import type { PersonnelArtifactWriter } from '$features/personnel/contracts';
import { derivePersonnelDocumentTitle } from '$features/personnel/utils/documentTitles';
import { fail } from '$lib/errors';
import { hasPdfFileSignature } from '$lib/storage/fileSignatures';
import {
	personnelArtifactWriter,
	requirePersonnelArtifactAccess,
	resolveContributorLabel,
	type PersonnelArtifactsContext,
	type PersonnelDocumentRow
} from './personnelArtifactContext.server';

export const PERSONNEL_DOCUMENTS_BUCKET = 'personnel-documents';
export const MAX_PERSONNEL_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']);

export interface PersonnelDocumentInput {
	personnelId: string;
	title?: string;
	file: File;
}

export interface PersonnelDocumentDownloadInput {
	personnelId: string;
	documentId: string;
}

const documentInputSchema = z.object({
	personnelId: z.string().min(1),
	title: z.string().trim().max(160).optional()
});

function hasJpegSignature(bytes: Uint8Array): boolean {
	return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes: Uint8Array): boolean {
	return (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	);
}

function hasHeicSignature(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const brand = String.fromCharCode(...bytes.slice(8, 12));
	return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
}

function matchesDeclaredType(file: File, bytes: Uint8Array): boolean {
	if (file.type === 'application/pdf') return hasPdfFileSignature(bytes);
	if (file.type === 'image/jpeg') return hasJpegSignature(bytes);
	if (file.type === 'image/png') return hasPngSignature(bytes);
	if (file.type === 'image/heic' || file.type === 'image/heif') return hasHeicSignature(bytes);
	return false;
}

async function assertAcceptedDocumentFile(file: File): Promise<void> {
	if (!(file instanceof File)) fail(400, 'A document file is required.');
	if (!ACCEPTED_DOCUMENT_TYPES.has(file.type)) {
		fail(400, 'Documents must be PDF, JPEG, PNG, or HEIC files.');
	}
	if (file.size > MAX_PERSONNEL_DOCUMENT_BYTES) {
		fail(413, 'Documents must be 10MB or smaller.');
	}
	const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	if (!matchesDeclaredType(file, bytes)) {
		fail(400, 'Document contents must match the uploaded file type.');
	}
}

function safeFilename(filename: string): string {
	const fallback = 'personnel-document';
	const cleaned = filename
		.split(/[\\/]/)
		.pop()
		?.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return cleaned || fallback;
}

async function assertStorageCap(
	ctx: PersonnelArtifactsContext,
	writer: PersonnelArtifactWriter,
	nextBytes: number
): Promise<void> {
	const [capBytes, currentBytes] = await Promise.all([ctx.documentStorageCapBytes(), writer.sumActiveDocumentBytes()]);
	if (currentBytes + nextBytes > capBytes) {
		fail(409, 'This Soldier has reached the document storage cap.');
	}
}

export async function listPersonnelDocuments(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelDocument[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId, 'read');
	const rows = await ctx.persistence.listDocuments(personnelId, { archived: !!options.archived, limit });
	const labels = await ctx.contributorLabels(rows.flatMap((row) => (row.uploaded_by ? [row.uploaded_by] : [])));
	return rows.map((row) => mapDocumentRow(row, labels));
}

export async function createPersonnelDocument(
	ctx: PersonnelArtifactsContext,
	rawInput: PersonnelDocumentInput
): Promise<PersonnelDocument> {
	const parsed = documentInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	await assertAcceptedDocumentFile(rawInput.file);

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	await assertStorageCap(ctx, writer, rawInput.file.size);

	const filename = safeFilename(rawInput.file.name);
	const filePath = `${ctx.actor.orgId}/personnel/${input.personnelId}/documents/${crypto.randomUUID()}-${filename}`;
	const upload = await writer.uploadFile('document', filePath, rawInput.file);

	let row: PersonnelDocumentRow;
	try {
		row = await writer.insert<PersonnelDocumentRow>('personnel_documents', {
			title: derivePersonnelDocumentTitle({ title: input.title, filename: rawInput.file.name }),
			file_path: filePath,
			file_size_bytes: rawInput.file.size,
			content_type: rawInput.file.type,
			uploaded_by: ctx.actor.userId,
			created_at: new Date().toISOString()
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
		await writer.removeFile('document', filePath);
		await upload.complete();
		throw error;
	}
	await upload.complete();

	ctx.audit.log({
		action: 'personnel.document.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await ctx.contributorLabels(row.uploaded_by ? [row.uploaded_by] : []);
	return mapDocumentRow(row, labels);
}

export async function createPersonnelDocumentDownloadUrl(
	ctx: PersonnelArtifactsContext,
	input: PersonnelDocumentDownloadInput
): Promise<{ url: string }> {
	await requirePersonnelArtifactAccess(ctx, input.personnelId, 'read');
	const document = await ctx.persistence.findDocument(input.personnelId, input.documentId);
	if (!document) fail(404, 'Document not found');

	return {
		url: await ctx.createDocumentSignedUrl(document.file_path, 300)
	};
}

async function loadDocumentForWrite(ctx: PersonnelArtifactsContext, personnelId: string, id: string) {
	const writer = await personnelArtifactWriter(ctx, personnelId);
	const row = await writer.find<PersonnelDocumentRow>('personnel_documents', id);
	if (!row) fail(404, 'Document not found');
	return { writer, row };
}

export async function archivePersonnelDocument(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; documentId: string }
): Promise<PersonnelDocument> {
	const { writer, row: existing } = await loadDocumentForWrite(ctx, input.personnelId, input.documentId);
	if (existing.archived_at) fail(409, 'Document is already archived');
	const row = await writer.update<PersonnelDocumentRow>('personnel_documents', input.documentId, {
		archived_at: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.document.archived', resourceType: 'personnel', resourceId: input.personnelId });
	return mapDocumentRow(row, await ctx.contributorLabels(row.uploaded_by ? [row.uploaded_by] : []));
}

export async function restorePersonnelDocument(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; documentId: string }
): Promise<PersonnelDocument> {
	const { writer } = await loadDocumentForWrite(ctx, input.personnelId, input.documentId);
	const row = await writer.update<PersonnelDocumentRow>('personnel_documents', input.documentId, { archived_at: null });
	ctx.audit.log({ action: 'personnel.document.restored', resourceType: 'personnel', resourceId: input.personnelId });
	return mapDocumentRow(row, await ctx.contributorLabels(row.uploaded_by ? [row.uploaded_by] : []));
}

export async function deletePersonnelDocument(
	ctx: PersonnelArtifactsContext,
	input: { personnelId: string; documentId: string }
): Promise<void> {
	const { writer, row } = await loadDocumentForWrite(ctx, input.personnelId, input.documentId);
	if (!row.archived_at) fail(409, 'Archive documents before deleting them');
	await writer.delete('personnel_documents', input.documentId);
	await writer.removeFile('document', row.file_path);
	ctx.audit.log({ action: 'personnel.document.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}

function fileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() ?? 'document';
}

function mapDocumentRow(row: PersonnelDocumentRow, contributorLabels = new Map<string, string>()): PersonnelDocument {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		title: row.title,
		fileName: fileNameFromPath(row.file_path),
		fileSizeBytes: row.file_size_bytes,
		contentType: row.content_type,
		uploadedBy: resolveContributorLabel(contributorLabels, row.uploaded_by),
		createdAt: row.created_at ?? new Date().toISOString(),
		archivedAt: row.archived_at ?? null
	};
}
