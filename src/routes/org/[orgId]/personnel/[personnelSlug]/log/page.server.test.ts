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
	it('streams the follow-up list and the newest page of notes with the full note count for the slug-resolved Soldier', async () => {
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
		ctx.store.seed(
			'leader_notes',
			Array.from({ length: 7 }, (_, index) => ({
				id: `note-${index + 1}`,
				organization_id: 'org-1',
				personnel_id: 'person-1',
				author: 'test-user',
				text: `Observation ${index + 1}`,
				created_at: `2026-05-0${index + 1}T10:00:00Z`,
				archived_at: null
			}))
		);
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

		await expect(result.followUps).resolves.toMatchObject([
			{ id: 'follow-up-1', personnelId: 'person-1', title: 'Schedule dental exam', status: 'open' }
		]);
		const { notes, total } = await result.notes;
		expect(total).toBe(7);
		expect(notes.map((note) => note.text)).toEqual([
			'Observation 7',
			'Observation 6',
			'Observation 5',
			'Observation 4',
			'Observation 3'
		]);
	});
});
