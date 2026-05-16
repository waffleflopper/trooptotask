import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig } from './+server';
import { _patchConfig } from './[documentId]/+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
}

describe('/api/personnel/[id]/documents', () => {
	it('creates and lists personnel documents through API configs', async () => {
		const ctx = createTestContext({
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
		seedPersonnel(ctx);

		const created = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			title: 'BLS Card',
			file: new File([PDF_BYTES], 'bls.pdf', { type: 'application/pdf' })
		});
		const records = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' });

		expect(created.title).toBe('BLS Card');
		expect(records).toHaveLength(1);
	});

	it('derives the Personnel id from the route param for form submissions', async () => {
		const formData = new FormData();
		formData.set('title', 'Inspection Worksheet');
		formData.set('file', new File([PDF_BYTES], 'inspection.pdf', { type: 'application/pdf' }));

		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', { method: 'POST', body: formData })
			} as never)
		).resolves.toMatchObject({
			personnelId: 'person-1',
			title: 'Inspection Worksheet'
		});
	});

	it('validates document archive and restore actions explicitly', async () => {
		const ctx = createTestContext({
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
		seedPersonnel(ctx);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				title: 'BLS Card',
				file_path: 'test-org/personnel/person-1/documents/bls.pdf',
				file_size_bytes: 5,
				content_type: 'application/pdf',
				uploaded_by: 'test-user',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: null
			}
		]);

		const archived = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			documentId: 'document-1',
			action: 'archive'
		})) as { archivedAt: string | null };
		expect(archived.archivedAt).toBeTruthy();
		const restored = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			documentId: 'document-1',
			action: 'restore'
		})) as { archivedAt: string | null };
		expect(restored.archivedAt).toBeNull();
		await expect(
			handleUseCaseRequest(_patchConfig, ctx, {
				personnelId: 'person-1',
				documentId: 'document-1',
				action: 'publish'
			})
		).rejects.toMatchObject({ status: 400 });
	});
});
