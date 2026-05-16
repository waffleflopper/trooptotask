import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { restorePersonnelArchivedArtifact, type RestoredPersonnelArchivedArtifact } from './personnelArchivedArtifacts';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: null,
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica'
		}
	]);
}

describe('personnel archived artifacts', () => {
	it('restores archived artifacts with a typed kind-specific result', async () => {
		type RestoreResult = Awaited<ReturnType<typeof restorePersonnelArchivedArtifact>>;
		expectTypeOf<RestoreResult>().toEqualTypeOf<RestoredPersonnelArchivedArtifact>();

		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: 'test-user',
				text: 'Archived note',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: '2026-05-02T10:00:00Z'
			}
		]);

		const restored = await restorePersonnelArchivedArtifact(ctx, {
			personnelId: 'person-1',
			kind: 'note',
			id: 'note-1'
		});

		expect(restored).toMatchObject({
			kind: 'note',
			id: 'note-1',
			personnelId: 'person-1',
			text: 'Archived note',
			archivedAt: null
		});
	});
});
