import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	createPersonnelArtifactDeliveryContext,
	createRequestPersonnelDetailContext
} from '$lib/server/adapters/requestContexts.server';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelFilesPageLoad } from './+page.server';

describe('personnel files page server load', () => {
	it('loads the full counseling and document lists for the slug-resolved Soldier', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'org-1', slug: 'rivera-monica', group_id: null }]);
		ctx.store.seed('counseling_records', [
			{
				id: 'record-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				date_conducted: '2026-05-01',
				title: 'Monthly counseling',
				summary: 'Reviewed board prep.',
				uploaded_by: 'test-user',
				file_path: 'test-org/personnel/person-1/counseling-records/monthly.pdf',
				created_at: '2026-05-02T10:00:00Z',
				archived_at: null
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				title: 'BLS Card',
				file_path: 'org-1/personnel/person-1/documents/bls.pdf',
				file_size_bytes: 500,
				content_type: 'application/pdf',
				uploaded_by: 'test-user',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: null
			}
		]);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) =>
			config.fn(
				config.context === createRequestPersonnelDetailContext ? ctx : createPersonnelArtifactDeliveryContext(ctx)
			)
		);
		const load = _createPersonnelFilesPageLoad({ loadWithContext });

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never
		} as never);

		expect(result.counselings.records).toEqual([
			{
				id: 'record-1',
				personnelId: 'person-1',
				dateConducted: '2026-05-01',
				title: 'Monthly counseling',
				summary: 'Reviewed board prep.',
				status: 'uploaded',
				uploadedBy: 'test-user',
				fileName: 'monthly.pdf',
				createdAt: '2026-05-02T10:00:00Z',
				archivedAt: null
			}
		]);
		expect(result.documents.records).toEqual([
			{
				id: 'document-1',
				personnelId: 'person-1',
				title: 'BLS Card',
				fileName: 'bls.pdf',
				fileSizeBytes: 500,
				contentType: 'application/pdf',
				uploadedBy: 'test-user',
				createdAt: '2026-05-01T10:00:00Z',
				archivedAt: null
			}
		]);
	});
});
