import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { mergePersonnelBatch } from './personnelMergeBatch';

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	return createTestContext(overrides);
}

describe('mergePersonnelBatch', () => {
	it('updates ETS and DEROS on an existing uniquely matched personnel row without creating a duplicate', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '2027-05-01',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(0);
		expect(result.skipped).toHaveLength(0);
		expect(result.updated).toHaveLength(1);
		expect(result.updated[0]).toMatchObject({
			id: 'person-1',
			ets: '2027-05-01',
			deros: '2026-11-30'
		});

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(1);
		expect(personnel[0]).toMatchObject({
			id: 'person-1',
			ets: '2027-05-01',
			deros: '2026-11-30'
		});
	});

	it('reports ambiguous and unmatched rows instead of guessing', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '2027-05-01'
				},
				{
					rank: 'SSG',
					lastName: 'Jones',
					firstName: 'Pat',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.ambiguous).toEqual([{ index: 0, message: 'Multiple personnel rows matched this record' }]);
		expect(result.errors).toEqual([{ index: 1, message: 'No active personnel row matched this record' }]);
	});

	it('skips rows that do not provide a new ETS or DEROS value to apply', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: ''
				},
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '2027-05-01'
				}
			]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.skipped).toEqual([
			{ index: 0, message: 'No ETS or DEROS value provided for update' },
			{ index: 1, message: 'Matched personnel already has the requested values' }
		]);
	});

	it('uses group name to disambiguate duplicate personnel matches', async () => {
		const ctx = buildContext();
		ctx.store.seed('groups', [
			{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' },
			{ id: 'group-2', organization_id: 'test-org', name: 'Bravo' }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				ets: null,
				deros: null,
				archived_at: null
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-2',
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					groupName: 'Bravo',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.ambiguous).toHaveLength(0);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-2',
				deros: '2026-11-30'
			})
		]);
	});

	it('matches a unique rank/name row even when the provided groupName is stale', async () => {
		const ctx = buildContext();
		ctx.store.seed('groups', [
			{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' },
			{ id: 'group-2', organization_id: 'test-org', name: 'Bravo' }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-2',
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					groupName: 'Typo',
					ets: '2027-05-01'
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(0);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-1',
				ets: '2027-05-01'
			})
		]);
	});

	it('rejects duplicate rank/name rows when the provided groupName matches none of them', async () => {
		const ctx = buildContext();
		ctx.store.seed('groups', [
			{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' },
			{ id: 'group-2', organization_id: 'test-org', name: 'Bravo' }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				ets: null,
				deros: null,
				archived_at: null
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-2',
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					groupName: 'Charlie',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(0);
		expect(result.errors).toEqual([{ index: 0, message: 'No active personnel row matched this record' }]);
	});

	it('rejects malformed ETS and DEROS date strings during merge', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '12/25/2026',
					deros: '2026-02-30'
				}
			]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.errors).toEqual([{ index: 0, message: 'ETS and DEROS must be valid YYYY-MM-DD dates' }]);
		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel[0]).toMatchObject({
			ets: null,
			deros: null
		});
	});

	it('denies a merge update when the matched personnel row is outside the actor Scope Set', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-b',
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		await expect(
			mergePersonnelBatch(ctx, {
				records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }]
			})
		).rejects.toMatchObject({ status: 403 });

		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				details: expect.objectContaining({
					policyAction: 'personnel.mergeRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});
