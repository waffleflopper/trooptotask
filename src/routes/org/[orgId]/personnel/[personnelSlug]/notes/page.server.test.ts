import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelNotesPageLoad } from './+page.server';

describe('personnel notes page server load', () => {
	it('loads the full leader note journal for the layout-resolved Soldier', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => ({ id: 'person-1', group_id: null })),
				findMany: vi.fn(async () => [
					{
						id: 'note-1',
						personnel_id: 'person-1',
						author: 'test-user',
						text: 'Recent observation',
						created_at: '2026-05-14T10:00:00Z'
					}
				])
			},
			auth: {
				orgId: 'org-1',
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
		const load = _createPersonnelNotesPageLoad({ loadWithContext });
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

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-notes');
		expect(result.notes).toEqual([
			{
				id: 'note-1',
				personnelId: 'person-1',
				author: 'test-user',
				date: '2026-05-14',
				text: 'Recent observation',
				createdAt: '2026-05-14T10:00:00Z',
				archivedAt: null
			}
		]);
	});
});
