import { describe, expect, it } from 'vitest';
import { createQueryWithRawStorePortsContext } from '$lib/server/adapters/inMemory';
import { loadArchivesSettings } from './settingsArchives.server';

describe('loadArchivesSettings', () => {
	it('shows only in-Group archived personnel, newest first', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: { role: 'member', scopeSet: { kind: 'groups', groupIds: ['group-a'] } }
		});
		ctx.rawStore.seed('organizations', [{ id: ctx.auth.orgId, archive_retention_months: 12 }]);
		ctx.rawStore.seed('personnel', [
			{
				id: 'older',
				organization_id: ctx.auth.orgId,
				group_id: 'group-a',
				first_name: 'Ada',
				last_name: 'Able',
				archived_at: '2025-01-01T00:00:00.000Z'
			},
			{
				id: 'newer',
				organization_id: ctx.auth.orgId,
				group_id: 'group-a',
				first_name: 'Zoe',
				last_name: 'Zulu',
				archived_at: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'other-group',
				organization_id: ctx.auth.orgId,
				group_id: 'group-b',
				archived_at: '2027-01-01T00:00:00.000Z'
			},
			{
				id: 'unassigned',
				organization_id: ctx.auth.orgId,
				group_id: null,
				archived_at: '2027-02-01T00:00:00.000Z'
			},
			{
				id: 'active',
				organization_id: ctx.auth.orgId,
				group_id: 'group-a',
				archived_at: null
			},
			{
				id: 'foreign',
				organization_id: 'foreign-org',
				group_id: 'group-a',
				archived_at: '2027-03-01T00:00:00.000Z'
			}
		]);

		const settings = await loadArchivesSettings(ctx, { isAdmin: false });
		expect(settings.sections.archivedPersonnel.rows.map((person) => person.id)).toEqual(['newer', 'older']);
	});
});
