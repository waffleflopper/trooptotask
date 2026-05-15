import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	createPersonnelDocument,
	createPersonnelDocumentDownloadUrl,
	DEFAULT_PERSONNEL_DOCUMENT_STORAGE_CAP_BYTES,
	listPersonnelDocuments
} from './personnelDocuments';

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

function operateContext() {
	return createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'operate',
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
	it('uploads a valid document, derives a title from the filename, and lists newest first', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				personnel_document_storage_cap_bytes: DEFAULT_PERSONNEL_DOCUMENT_STORAGE_CAP_BYTES
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

		const created = await createPersonnelDocument(ctx, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'inspection-worksheet_2026.pdf', { type: 'application/pdf' })
		});
		const records = await listPersonnelDocuments(ctx, 'person-1');

		expect(created).toMatchObject({
			personnelId: 'person-1',
			title: 'inspection worksheet 2026',
			fileSizeBytes: PDF_BYTES.byteLength,
			contentType: 'application/pdf',
			uploadedBy: 'test-user'
		});
		expect(created.filePath).toMatch(/person-1\/documents\/.+inspection-worksheet_2026\.pdf$/);
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(1);
		expect(records.map((record) => record.id)).toEqual([created.id, 'old-document']);
	});

	it('uses an editable title when one is submitted', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);

		const created = await createPersonnelDocument(ctx, {
			personnelId: 'person-1',
			title: 'Updated BLS Card',
			file: new File([PNG_BYTES], 'bls-card.png', { type: 'image/png' })
		});

		expect(created.title).toBe('Updated BLS Card');
	});

	it('rejects unsupported file types and files over 10MB', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);

		await expect(
			createPersonnelDocument(ctx, {
				personnelId: 'person-1',
				file: new File(['text'], 'notes.txt', { type: 'text/plain' })
			})
		).rejects.toMatchObject({ status: 400 });

		await expect(
			createPersonnelDocument(ctx, {
				personnelId: 'person-1',
				file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 413 });

		await expect(
			createPersonnelDocument(ctx, {
				personnelId: 'person-1',
				file: new File(['not-a-pdf'], 'spoofed.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('enforces the organization-level per-Soldier storage cap', async () => {
		const ctx = operateContext();
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
			createPersonnelDocument(ctx, {
				personnelId: 'person-1',
				file: new File([PDF_BYTES], 'next.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('removes the uploaded object when record persistence fails', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		ctx.store.insert = async () => {
			throw new Error('insert failed');
		};

		await expect(
			createPersonnelDocument(ctx, {
				personnelId: 'person-1',
				file: new File([PDF_BYTES], 'orphan.pdf', { type: 'application/pdf' })
			})
		).rejects.toThrow('insert failed');
		expect((ctx.storage as typeof ctx.storage & { files: unknown[] }).files).toHaveLength(0);
	});

	it('creates a short-lived signed URL for an uploaded document', async () => {
		const ctx = operateContext();
		seedPersonnel(ctx);
		const created = await createPersonnelDocument(ctx, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'download.pdf', { type: 'application/pdf' })
		});

		const result = await createPersonnelDocumentDownloadUrl(ctx, {
			personnelId: 'person-1',
			documentId: created.id
		});

		expect(result.url).toContain('/personnel-documents/');
		expect(result.url).toContain('expires=300');
	});

	it('requires Personnel operate capability and group scope', async () => {
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
		await expect(listPersonnelDocuments(viewOnly, 'person-1')).rejects.toMatchObject({ status: 403 });

		const outOfScope = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}
		});
		seedPersonnel(outOfScope, 'group-1');
		await expect(listPersonnelDocuments(outOfScope, 'person-1')).rejects.toMatchObject({ status: 403 });
	});
});
