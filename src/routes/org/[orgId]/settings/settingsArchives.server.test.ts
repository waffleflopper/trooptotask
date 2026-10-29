import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it } from 'vitest';
import { createQueryWithRawStorePortsContext } from '$lib/server/adapters/inMemory';
import { loadArchivesSettings } from './settingsArchives.server';

describe('loadArchivesSettings', () => {
	it.each([0, null, 'failure'] as const)(
		'reads missing or zero retention as the 36-month default and propagates read failures (%s)',
		async (value) => {
			const ctx = createQueryWithRawStorePortsContext();
			ctx.organizationSettings.findArchiveRetentionMonths = async () => {
				if (value === 'failure') throw new Error('Retention unavailable');
				return value;
			};
			const pending = loadArchivesSettings(ctx, { isAdmin: false, timeZone: 'UTC' });
			if (value === 'failure') await expect(pending).rejects.toThrow('Retention unavailable');
			else expect((await pending).sections.archivedPersonnel.retention.months).toBe(36);
		}
	);

	it('shows only in-Group archived personnel, newest first', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: { role: 'member', scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] }) }
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

		const settings = await loadArchivesSettings(ctx, { isAdmin: false, timeZone: 'UTC' });
		expect(settings.sections.archivedPersonnel.rows.map((person) => person.id)).toEqual(['newer', 'older']);
	});
});
