import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	createPersonnelArtifactDeliveryContext,
	createPersonnelLeaderNoteDeliveryContext,
	createRequestPersonnelDetailContext,
	createRequestPersonnelLeaderNoteContext
} from '$lib/server/adapters/requestContexts.server';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelLogPageLoad } from './+page.server';

describe('personnel log page server load', () => {
	it('loads the full follow-up list and leader note journal for the slug-resolved Soldier', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'org-1', slug: 'rivera-monica', group_id: null }]);
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				title: 'Schedule dental exam',
				notes: null,
				due_date: '2026-05-20',
				status: 'open',
				created_by: 'test-user',
				created_at: '2026-05-01T08:00:00Z',
				updated_at: '2026-05-01T08:00:00Z',
				completed_at: null,
				archived_at: null
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				author: 'test-user',
				text: 'Recent observation',
				created_at: '2026-05-14T10:00:00Z',
				archived_at: null
			}
		]);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => {
			if (config.context === createRequestPersonnelDetailContext) return config.fn(ctx);
			if (config.context === createRequestPersonnelLeaderNoteContext)
				return config.fn(createPersonnelLeaderNoteDeliveryContext(ctx));
			return config.fn(createPersonnelArtifactDeliveryContext(ctx));
		});
		const load = _createPersonnelLogPageLoad({ loadWithContext });

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never
		} as never);

		expect(result.followUps.records).toMatchObject([
			{ id: 'follow-up-1', personnelId: 'person-1', title: 'Schedule dental exam', status: 'open' }
		]);
		expect(result.notes.notes).toEqual([
			{
				id: 'note-1',
				personnelId: 'person-1',
				author: 'test-user',
				text: 'Recent observation',
				createdAt: '2026-05-14T10:00:00Z',
				archivedAt: null
			}
		]);
	});
});
