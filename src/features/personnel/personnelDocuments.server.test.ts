import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	archivePersonnelDocument,
	deletePersonnelDocument,
	restorePersonnelDocument,
	createPersonnelDocument,
	createPersonnelDocumentDownloadUrl,
	listPersonnelDocuments
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

	it('retains row-before-file deletion and suppresses the success audit when Storage fails', async () => {
		const ctx = configureContext();
		seedPersonnel(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		const created = await createPersonnelDocument(context, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'signed.pdf', { type: 'application/pdf' })
		});
		await archivePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id });
		const priorEvents = [...ctx.auditPort.events];
		ctx.storagePort.remove = async () => {
			expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: created.id })).toBeNull();
			throw new Error('Storage unavailable');
		};
		await expect(deletePersonnelDocument(context, { personnelId: 'person-1', documentId: created.id })).rejects.toThrow(
			'Storage unavailable'
		);
		expect(await ctx.rawStore.findOne('personnel_documents', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual(priorEvents);
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
