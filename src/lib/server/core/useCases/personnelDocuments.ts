import { z } from 'zod';
import type { PersonnelDocument } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { requirePersonnelArtifactAccess } from './personnelArtifactAuthorization';
import { loadPersonnelContributorLabels, resolveContributorLabel } from './personnelContributorLabels';

export const PERSONNEL_DOCUMENTS_BUCKET = 'personnel-documents';
export const MAX_PERSONNEL_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_PERSONNEL_DOCUMENT_STORAGE_CAP_BYTES = 100 * 1024 * 1024;

const ACCEPTED_DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']);

interface PersonnelDocumentRow {
	id: string;
	personnel_id: string;
	title: string;
	file_path: string;
	file_size_bytes: number;
	content_type: string;
	uploaded_by: string;
	created_at?: string | null;
	archived_at?: string | null;
}

interface OrganizationDocumentSettingsRow {
	personnel_document_storage_cap_bytes?: number | null;
}

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

function fileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() ?? 'document';
}

function hasPdfSignature(bytes: Uint8Array): boolean {
	return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

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
	if (file.type === 'application/pdf') return hasPdfSignature(bytes);
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

export function titleFromFilename(filename: string): string {
	const base = safeFilename(filename).replace(/\.[^.]+$/, '');
	const title = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
	return title || 'Uploaded document';
}

async function loadDocumentStorageCapBytes(ctx: UseCaseContext): Promise<number> {
	const settings = await ctx.store.findOne<OrganizationDocumentSettingsRow>(
		'organizations',
		ctx.auth.orgId,
		{ id: ctx.auth.orgId },
		'personnel_document_storage_cap_bytes'
	);
	return settings?.personnel_document_storage_cap_bytes ?? DEFAULT_PERSONNEL_DOCUMENT_STORAGE_CAP_BYTES;
}

async function sumPersonnelDocumentBytes(ctx: UseCaseContext, personnelId: string): Promise<number> {
	const rows = await ctx.store.findMany<Pick<PersonnelDocumentRow, 'file_size_bytes'>>(
		'personnel_documents',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{ select: 'file_size_bytes', isNull: { archived_at: true } }
	);
	return rows.reduce((total, row) => total + (row.file_size_bytes ?? 0), 0);
}

async function assertStorageCap(ctx: UseCaseContext, personnelId: string, nextBytes: number): Promise<void> {
	const [capBytes, currentBytes] = await Promise.all([
		loadDocumentStorageCapBytes(ctx),
		sumPersonnelDocumentBytes(ctx, personnelId)
	]);
	if (currentBytes + nextBytes > capBytes) {
		fail(409, 'This Soldier has reached the document storage cap.');
	}
}

export async function listPersonnelDocuments(
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelDocument[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId);
	const rows = await ctx.store.findMany<PersonnelDocumentRow>(
		'personnel_documents',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			isNull: { archived_at: !options.archived },
			limit
		}
	);
	const labels = await loadPersonnelContributorLabels(
		ctx,
		rows.map((row) => row.uploaded_by)
	);
	return rows.map((row) => mapDocumentRow(row, labels));
}

export async function createPersonnelDocument(
	ctx: UseCaseContext,
	rawInput: PersonnelDocumentInput
): Promise<PersonnelDocument> {
	const parsed = documentInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	await assertAcceptedDocumentFile(rawInput.file);

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);
	await assertStorageCap(ctx, input.personnelId, rawInput.file.size);

	const filename = safeFilename(rawInput.file.name);
	const filePath = `${ctx.auth.orgId}/personnel/${input.personnelId}/documents/${crypto.randomUUID()}-${filename}`;
	await ctx.storage.upload(PERSONNEL_DOCUMENTS_BUCKET, filePath, rawInput.file);

	let row: PersonnelDocumentRow;
	try {
		row = await ctx.store.insert<PersonnelDocumentRow>('personnel_documents', ctx.auth.orgId, {
			personnel_id: input.personnelId,
			title: input.title?.trim() || titleFromFilename(rawInput.file.name),
			file_path: filePath,
			file_size_bytes: rawInput.file.size,
			content_type: rawInput.file.type,
			uploaded_by: ctx.auth.userId ?? 'Unknown leader',
			created_at: new Date().toISOString()
		});
	} catch (error) {
		await ctx.storage.remove(PERSONNEL_DOCUMENTS_BUCKET, [filePath]);
		throw error;
	}

	ctx.audit.log({
		action: 'personnel.document.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapDocumentRow(row, labels);
}

export async function createPersonnelDocumentDownloadUrl(
	ctx: UseCaseContext,
	input: PersonnelDocumentDownloadInput
): Promise<{ url: string }> {
	await requirePersonnelArtifactAccess(ctx, input.personnelId);
	const document = await ctx.store.findOne<PersonnelDocumentRow>('personnel_documents', ctx.auth.orgId, {
		id: input.documentId,
		personnel_id: input.personnelId
	});
	if (!document) fail(404, 'Document not found');

	return {
		url: await ctx.storage.createSignedUrl(PERSONNEL_DOCUMENTS_BUCKET, document.file_path, 300)
	};
}

async function loadDocument(
	ctx: UseCaseContext,
	personnelId: string,
	documentId: string
): Promise<PersonnelDocumentRow> {
	await requirePersonnelArtifactAccess(ctx, personnelId);
	const row = await ctx.store.findOne<PersonnelDocumentRow>('personnel_documents', ctx.auth.orgId, {
		id: documentId,
		personnel_id: personnelId
	});
	if (!row) fail(404, 'Document not found');
	return row;
}

export async function archivePersonnelDocument(
	ctx: UseCaseContext,
	input: { personnelId: string; documentId: string }
): Promise<PersonnelDocument> {
	const existing = await loadDocument(ctx, input.personnelId, input.documentId);
	if (existing.archived_at) fail(409, 'Document is already archived');
	const row = await ctx.store.update<PersonnelDocumentRow>('personnel_documents', ctx.auth.orgId, input.documentId, {
		archived_at: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.document.archived', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapDocumentRow(row, labels);
}

export async function restorePersonnelDocument(
	ctx: UseCaseContext,
	input: { personnelId: string; documentId: string }
): Promise<PersonnelDocument> {
	await loadDocument(ctx, input.personnelId, input.documentId);
	const row = await ctx.store.update<PersonnelDocumentRow>('personnel_documents', ctx.auth.orgId, input.documentId, {
		archived_at: null
	});
	ctx.audit.log({ action: 'personnel.document.restored', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.uploaded_by]);
	return mapDocumentRow(row, labels);
}

export async function deletePersonnelDocument(
	ctx: UseCaseContext,
	input: { personnelId: string; documentId: string }
): Promise<void> {
	const row = await loadDocument(ctx, input.personnelId, input.documentId);
	if (!row.archived_at) fail(409, 'Archive documents before deleting them');
	await ctx.store.delete('personnel_documents', ctx.auth.orgId, input.documentId);
	await ctx.storage.remove(PERSONNEL_DOCUMENTS_BUCKET, [row.file_path]);
	ctx.audit.log({ action: 'personnel.document.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}
