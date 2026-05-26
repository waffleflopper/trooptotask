import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelCounselingsPageLoad } from './+page.server';

describe('personnel counselings page server load', () => {
	it('loads the full counseling upload list for the layout-resolved Soldier', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => ({ id: 'person-1', group_id: null })),
				findMany: vi.fn(async () => [
					{
						id: 'record-1',
						personnel_id: 'person-1',
						date_conducted: '2026-05-01',
						title: 'Monthly counseling',
						summary: 'Reviewed board prep.',
						uploaded_by: 'test-user',
						file_path: 'test-org/personnel/person-1/counseling-records/monthly.pdf',
						created_at: '2026-05-02T10:00:00Z'
					}
				])
			},
			auth: {
				orgId: 'org-1',
				userId: 'test-user',
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				compatibilityLanes: {},
				scopeSet: { kind: 'organization' }
			},
			scope: {
				requireGroupAccess: vi.fn(async () => {})
			},
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelCounselingsPageLoad({ loadWithContext });
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

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-counselings');
		expect(result.records).toEqual([
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
	});
});
