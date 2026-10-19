import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelDocument,
	deletePersonnelDocument,
	restorePersonnelDocument,
	createPersonnelDocument,
	createPersonnelDocumentDownloadUrl,
	listPersonnelDocuments,
	readPersonnelDocuments
} from './personnelDocuments.server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: groupId
		}
	]);
}

function configureContext() {
	return createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'organization' }
		}
	});
}

describe('personnel documents', () => {
	it('lets a Personnel operator upload within the cap without gaining document reads', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		ctx.store.seed('organizations', [{ id: ctx.auth.orgId, personnel_document_storage_cap_bytes: 12 }]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'existing',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				file_size_bytes: 8,
				archived_at: null
			}
		]);
		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File([PDF_BYTES], 'over-cap.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 409 });
		await ctx.store.update('personnel_documents', ctx.auth.orgId, 'existing', {
			archived_at: '2026-01-01'
		});
		const created = await createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'allowed.pdf', { type: 'application/pdf' })
		});
		expect(created.title).toBe('allowed');
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(ctx), 'person-1')).rejects.toMatchObject({
			status: 403
		});
	});

	it('uploads a valid document, derives a title from the filename, and lists newest first', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				personnel_document_storage_cap_bytes: 104857600
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'old-document',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'BLS Card',
				file_path: 'test-org/personnel/person-1/documents/old.pdf',
				file_size_bytes: 500,
				content_type: 'application/pdf',
				uploaded_by: '1SG',
				created_at: '2026-04-01T10:00:00Z'
			}
		]);

		const created = await createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'inspection-worksheet_2026.pdf', { type: 'application/pdf' })
		});
		const records = await listPersonnelDocuments(testPersonnelArtifactsContext(ctx), 'person-1');

		expect(created).toMatchObject({
			personnelId: 'person-1',
			title: 'inspection worksheet 2026',
			fileName: expect.stringMatching(/inspection-worksheet_2026\.pdf$/),
			fileSizeBytes: PDF_BYTES.byteLength,
			contentType: 'application/pdf',
			uploadedBy: 'test-user'
		});
		expect(created).not.toHaveProperty('filePath');
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(1);
		expect(records.map((record) => record.id)).toEqual([created.id, 'old-document']);
	});

	it('uses an editable title when one is submitted', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);

		const created = await createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			title: 'Updated BLS Card',
			file: new File([PNG_BYTES], 'bls-card.png', { type: 'image/png' })
		});

		expect(created.title).toBe('Updated BLS Card');
	});

	it('rejects unsupported file types and files over 10MB', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File(['text'], 'notes.txt', { type: 'text/plain' })
			})
		).rejects.toMatchObject({ status: 400 });

		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 413 });

		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File(['not-a-pdf'], 'spoofed.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('enforces the organization-level per-Soldier storage cap', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				personnel_document_storage_cap_bytes: 10
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'existing-document',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'Existing',
				file_path: 'test-org/personnel/person-1/documents/existing.pdf',
				file_size_bytes: 8,
				content_type: 'application/pdf',
				uploaded_by: '1SG',
				created_at: '2026-04-01T10:00:00Z'
			}
		]);

		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File([PDF_BYTES], 'next.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('removes the uploaded object when record persistence fails', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		ctx.store.insert = async () => {
			throw new Error('insert failed');
		};

		await expect(
			createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
				personnelId: 'person-1',
				file: new File([PDF_BYTES], 'orphan.pdf', { type: 'application/pdf' })
			})
		).rejects.toThrow('insert failed');
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(0);
	});

	it('creates a short-lived signed URL for an uploaded document', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const created = await createPersonnelDocument(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'download.pdf', { type: 'application/pdf' })
		});

		const result = await createPersonnelDocumentDownloadUrl(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			documentId: created.id
		});

		expect(result.url).toContain('/personnel-documents/');
		expect(result.url).toContain('expires=300');
	});

	it('requires Personnel configure capability for reads and group scope', async () => {
		const viewOnly = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(viewOnly);
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(viewOnly), 'person-1')).rejects.toMatchObject({
			status: 403
		});

		const outOfScope = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(outOfScope, 'group-1');
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(outOfScope), 'person-1')).rejects.toMatchObject({
			status: 403
		});
	});

	it.each([
		['image/jpeg', [0xff, 0xd8, 0xff, 0x00]],
		['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
		['image/heic', [0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
		['image/heif', [0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]]
	] as const)('accepts declared %s bytes while rejecting a spoofed declaration', async (type, signature) => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const file = new File([new Uint8Array(signature)], 'image.bin', { type });
		const created = await createPersonnelDocument(context, { personnelId: 'person-1', file });
		expect(created).toMatchObject({ contentType: type, fileSizeBytes: file.size });
		await expect(
			createPersonnelDocument(context, {
				personnelId: 'person-1',
				file: new File(['plain text'], 'spoof.bin', { type })
			})
		).rejects.toMatchObject({ status: 400 });
		expect(ctx.storagePort.files).toHaveLength(1);
	});

	it('allows restoring an active document and still rejects repeated archive', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelDocument(context, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'signed.pdf', { type: 'application/pdf' })
		});
		await expect(
			restorePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toMatchObject({ id: created.id, archivedAt: null });
		expect(ctx.auditPort.events.at(-1)).toMatchObject({ action: 'personnel.document.restored' });
		await archivePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id });
		await expect(
			archivePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).rejects.toMatchObject({ status: 409 });
	});

	async function archivedDocument(ctx: ReturnType<typeof configureContext>) {
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelDocument(context, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'signed.pdf', { type: 'application/pdf' })
		});
		await archivePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id });
		return { context, created };
	}

	it('reports a committed deletion with pending file cleanup and completes it on retry', async () => {
		const ctx = configureContext();
		const { context, created } = await archivedDocument(ctx);
		const remove = ctx.storagePort.remove;
		ctx.storagePort.remove = async () => {
			throw new Error('Storage unavailable');
		};
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toEqual({ fileCleanup: 'pending' });
		expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.document.deleted')).toHaveLength(1);

		ctx.storagePort.remove = remove;
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toEqual({ fileCleanup: 'complete' });
		expect(ctx.storagePort.files).toEqual([]);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.document.deleted')).toHaveLength(1);
	});

	it('deletes a metadata-only archived document whose file is already absent', async () => {
		const ctx = configureContext();
		const { context, created } = await archivedDocument(ctx);
		ctx.storagePort.files.length = 0;
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toEqual({ fileCleanup: 'complete' });
		expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: created.id })).toBeNull();
	});

	it('answers a retried deletion from its durable receipt only while the Person remains accessible', async () => {
		const ctx = configureContext();
		const { context, created } = await archivedDocument(ctx);
		await deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id });
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toEqual({ fileCleanup: 'complete' });
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: 'never-existed' })
		).rejects.toMatchObject({ status: 404 });
		await ctx.rawStore.delete('personnel', ctx.auth.orgId, 'person-1');
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).rejects.toMatchObject({ status: 404 });
	});

	it('keeps a document restored or re-archived after the delete read it', async () => {
		for (const winner of [null, '2026-10-13T00:00:00.000Z']) {
			const ctx = configureContext();
			const { context, created } = await archivedDocument(ctx);
			const admitted = context.writerFor.bind(context);
			context.writerFor = async (id) => {
				const writer = await admitted(id);
				return {
					...writer,
					async findDocument(documentId: string) {
						const row = structuredClone(await writer.findDocument(documentId));
						await ctx.rawStore.update('personnel_documents', ctx.auth.orgId, documentId, { archived_at: winner });
						return row;
					}
				};
			};
			await expect(
				deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
			).rejects.toMatchObject({ status: 409 });
			expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: created.id })).toMatchObject({
				archived_at: winner
			});
			expect(ctx.storagePort.files).toHaveLength(1);
		}
	});

	it('keeps bytes still referenced by another historical document', async () => {
		const ctx = configureContext();
		const { context, created } = await archivedDocument(ctx);
		const row = await ctx.rawStore.findOne<{ file_path: string }>('personnel_documents', ctx.auth.orgId, {
			id: created.id
		});
		ctx.store.seed('personnel_documents', [
			{
				id: 'shared-document',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'Shared',
				file_path: row!.file_path,
				file_size_bytes: PDF_BYTES.byteLength,
				content_type: 'application/pdf',
				uploaded_by: '1SG',
				created_at: '2026-04-01T10:00:00Z',
				archived_at: null
			}
		]);
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })
		).resolves.toEqual({ fileCleanup: 'complete' });
		expect(ctx.storagePort.files).toHaveLength(1);
		await expect(
			createPersonnelDocumentDownloadUrl(context, { personnelId: 'person-1', documentId: 'shared-document' })
		).resolves.toMatchObject({ url: expect.stringContaining(row!.file_path) });
	});

	it('does not mutate a document belonging to another Person in the same Organization', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		await ctx.store.insert('personnel', ctx.auth.orgId, { id: 'person-2', group_id: null });
		const context = testPersonnelArtifactsContext(ctx);
		const other = await createPersonnelDocument(context, {
			personnelId: 'person-2',
			file: new File([PDF_BYTES], 'signed.pdf', { type: 'application/pdf' })
		});
		const priorEvents = [...ctx.auditPort.events];
		const prior = await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: other.id });
		await expect(
			archivePersonnelDocument(context, { personnelId: 'person-1', documentId: other.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			restorePersonnelDocument(context, { personnelId: 'person-1', documentId: other.id })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			deletePersonnelDocument(context, { personnelId: 'person-1', documentId: other.id })
		).rejects.toMatchObject({ status: 404 });
		expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: other.id })).toEqual(prior);
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual(priorEvents);
	});
});

describe('Files tab document read', () => {
	function seededContext() {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const row = (id: string, createdAt: string, bytes: number, extra = {}) => ({
			id,
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			title: `Document ${id}`,
			file_path: `${ctx.auth.orgId}/personnel/person-1/documents/${id}.pdf`,
			file_size_bytes: bytes,
			content_type: 'application/pdf',
			uploaded_by: 'someone',
			created_at: createdAt,
			archived_at: null,
			...extra
		});
		ctx.store.seed('personnel_documents', [
			row('newest', '2026-10-03T10:00:00Z', 1_000),
			row('middle', '2026-10-02T10:00:00Z', 2_000),
			row('oldest', '2026-10-01T10:00:00Z', 4_000),
			row('archived', '2026-09-01T10:00:00Z', 8_000, { archived_at: '2026-09-02T00:00:00Z' })
		]);
		return ctx;
	}

	it('reads the newest page with the active total and the storage use against the cap', async () => {
		const ctx = seededContext();

		const read = await readPersonnelDocuments(testPersonnelArtifactsContext(ctx), {
			personnelId: 'person-1',
			limit: 2
		});

		expect(read.records.map((record) => record.id)).toEqual(['newest', 'middle']);
		expect(read.total).toBe(3);
		expect(read.usedBytes).toBe(7_000);
		expect(read.capBytes).toBeGreaterThan(read.usedBytes);
	});

	it('lists the rest from an offset', async () => {
		const ctx = seededContext();

		const rest = await listPersonnelDocuments(testPersonnelArtifactsContext(ctx), 'person-1', 2, { offset: 2 });

		expect(rest.map((record) => record.id)).toEqual(['oldest']);
	});
});
