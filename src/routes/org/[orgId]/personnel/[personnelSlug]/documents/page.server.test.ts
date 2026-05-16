import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelDocumentsPageLoad } from './+page.server';

describe('personnel documents page server load', () => {
	it('loads the full document list for the layout-resolved Soldier', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => ({ id: 'person-1', group_id: null })),
				findMany: vi.fn(async () => [
					{
						id: 'document-1',
						personnel_id: 'person-1',
						title: 'BLS Card',
						file_path: 'org-1/personnel/person-1/documents/bls.pdf',
						file_size_bytes: 500,
						content_type: 'application/pdf',
						uploaded_by: 'test-user',
						created_at: '2026-05-01T10:00:00Z'
					}
				])
			},
			auth: {
				orgId: 'org-1',
				userId: 'test-user',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				compatibilityLanes: {},
				scopeSet: { kind: 'organization' },
				requireGroupAccess: vi.fn(async () => {})
			},
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDocumentsPageLoad({ loadWithContext });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends,
			parent: vi.fn(async () => ({
				personnelDetailHeader: {
					person: { id: 'person-1' }
				}
			}))
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-documents');
		expect(result.records).toEqual([
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
