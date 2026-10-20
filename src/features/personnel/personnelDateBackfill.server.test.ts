import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, expect, it } from 'vitest';
import { createTestContext as basecreateTestContext } from '$lib/server/adapters/inMemory';

import { mergePersonnelBatch } from './personnelDateBackfill.server';
const createTestContext = (overrides?: Parameters<typeof basecreateTestContext>[0]) =>
	withPersonnelPersistence(basecreateTestContext(overrides));

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(overrides);
	seedRankCatalog(ctx, [
		{ code: 'SGT', label: 'Sergeant', pay_grade: 'E-5' },
		{ code: 'SSG', label: 'Staff Sergeant', pay_grade: 'E-6' }
	]);
	return ctx;
}

function seedRankCatalog(ctx: ReturnType<typeof buildContext>, entries: Array<Record<string, unknown>>) {
	ctx.store.seed(
		'organization_rank_catalog',
		entries.map((entry, index) => ({
			organization_id: ctx.auth.orgId,
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: index,
			...entry
		}))
	);
}

function freshPersonnelProvider(
	ctx: ReturnType<typeof buildContext>,
	originals: Array<Record<string, unknown>>,
	failBeforeUpdate?: (id: string) => boolean
) {
	const persisted = structuredClone(originals);
	const findMany = ctx.store.findMany.bind(ctx.store);
	const update = ctx.store.update.bind(ctx.store);
	ctx.store.findMany = async <T>(...args: Parameters<typeof ctx.store.findMany>): Promise<T[]> => {
		const [table, orgId, , options] = args;
		if (table !== 'personnel') return findMany<T>(...args);
		return structuredClone(
			persisted.filter(
				(row) => row.organization_id === orgId && (!options?.isNull?.archived_at || row.archived_at === null)
			)
		) as T[];
	};
	ctx.store.update = async <T>(...args: Parameters<typeof ctx.store.update>): Promise<T> => {
		const [table, orgId, id, patch] = args;
		if (table !== 'personnel') return update<T>(...args);
		if (failBeforeUpdate?.(id)) throw new Error('Provider unavailable: private-personnel-detail');
		const index = persisted.findIndex((row) => row.organization_id === orgId && row.id === id);
		if (index === -1) throw new Error('Personnel row missing');
		persisted[index] = { ...persisted[index], ...patch };
		return structuredClone(persisted[index]) as T;
	};
	return persisted;
}

function savedPerson(id: string, lastName: string, ets: string | null = null) {
	return {
		id,
		organization_id: 'test-org',
		rank: 'SGT',
		last_name: lastName,
		first_name: 'Jamie',
		mos: '68W',
		clinic_role: 'Medic',
		group_id: null,
		slug: `${lastName.toLowerCase()}-jamie`,
		ets,
		deros: '2028-06-01',
		archived_at: null
	};
}

describe('mergePersonnelBatch', () => {
	it('returns acknowledged updates and an indexed unconfirmed row, then recovers without rewriting the first Person', async () => {
		const ctx = buildContext();
		const originals = [savedPerson('person-one', 'Smith'), savedPerson('person-two', 'Rivera')];
		let failSecond = true;
		const persisted = freshPersonnelProvider(ctx, originals, (id) => id === 'person-two' && failSecond);
		const records = [
			{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' },
			{ rank: 'SGT', lastName: 'Rivera', firstName: 'Jamie', ets: '2027-07-01' }
		];

		const outcome = await mergePersonnelBatch(ctx, { records }).then(
			(value) => ({ value, error: null }),
			(error: unknown) => ({ value: null, error })
		);

		expect(persisted).toEqual([{ ...originals[0], ets: '2027-05-01' }, originals[1]]);
		expect.soft(outcome.error).toBeNull();
		expect.soft(outcome.value).toMatchObject({
			updated: [{ id: 'person-one', ets: '2027-05-01' }],
			errors: [{ index: 1, message: expect.any(String) }],
			skipped: [],
			ambiguous: []
		});
		const message = outcome.value?.errors[0]?.message ?? '';
		expect.soft(message).toMatch(/unconfirmed|not (?:be )?confirmed|could not confirm/i);
		expect.soft(message).not.toContain('private-personnel-detail');
		expect.soft(ctx.auditPort.events).toContainEqual({
			action: 'personnel.bulk_merged',
			resourceType: 'personnel',
			details: { matched: 2, updated: 1, skipped: 0, ambiguous: 0, errors: 1 }
		});

		failSecond = false;
		const recovered = await mergePersonnelBatch(ctx, { records });
		expect(recovered.updated).toMatchObject([{ id: 'person-two', ets: '2027-07-01' }]);
		expect(recovered.skipped).toEqual([{ index: 0, message: expect.any(String) }]);
		expect(recovered.errors).toEqual([]);
		expect(persisted).toEqual([
			{ ...originals[0], ets: '2027-05-01' },
			{ ...originals[1], ets: '2027-07-01' }
		]);
	});

	it('skips a separate-request replay while preserving every saved field and identity', async () => {
		const ctx = buildContext();
		const original = savedPerson('person-one', 'Smith');
		const persisted = freshPersonnelProvider(ctx, [original]);
		const input = { records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }] };
		const first = await mergePersonnelBatch(ctx, input);
		expect(first.updated).toMatchObject([{ id: original.id, ets: '2027-05-01' }]);
		const saved = structuredClone(persisted);

		const replay = await mergePersonnelBatch(ctx, input);
		expect(replay.updated).toEqual([]);
		expect(replay.skipped).toEqual([{ index: 0, message: expect.any(String) }]);
		expect(replay.errors).toEqual([]);
		expect(persisted).toEqual(saved);
		expect(persisted).toEqual([{ ...original, ets: '2027-05-01' }]);
	});

	it('continues an independent row after an unconfirmed update', async () => {
		const ctx = buildContext();
		const originals = [savedPerson('person-one', 'Smith'), savedPerson('person-two', 'Rivera')];
		const persisted = freshPersonnelProvider(ctx, originals, (id) => id === 'person-one');

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' },
				{ rank: 'SGT', lastName: 'Rivera', firstName: 'Jamie', ets: '2027-07-01' }
			]
		});

		expect(result.updated).toMatchObject([{ id: 'person-two', ets: '2027-07-01' }]);
		expect(result.errors).toEqual([{ index: 0, message: expect.any(String) }]);
		expect(persisted).toEqual([originals[0], { ...originals[1], ets: '2027-07-01' }]);
	});

	it('does not claim a lost acknowledgement proves no write and rereads saved dates on retry', async () => {
		const ctx = buildContext();
		const original = savedPerson('person-one', 'Smith');
		const persisted = freshPersonnelProvider(ctx, [original]);
		const update = ctx.store.update.bind(ctx.store);
		ctx.store.update = async <T>(...args: Parameters<typeof ctx.store.update>): Promise<T> => {
			await update<T>(...args);
			throw new Error('Acknowledgement lost: private-personnel-detail');
		};
		const input = { records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }] };

		const unconfirmed = await mergePersonnelBatch(ctx, input);
		expect(unconfirmed.updated).toEqual([]);
		expect(unconfirmed.errors).toEqual([{ index: 0, message: expect.any(String) }]);
		expect(unconfirmed.errors[0].message).toMatch(/unconfirmed|not (?:be )?confirmed|could not confirm/i);
		expect(unconfirmed.errors[0].message).not.toContain('private-personnel-detail');
		expect(persisted).toEqual([{ ...original, ets: '2027-05-01' }]);

		ctx.store.update = update;
		const replay = await mergePersonnelBatch(ctx, input);
		expect(replay.updated).toEqual([]);
		expect(replay.skipped).toEqual([{ index: 0, message: expect.any(String) }]);
		expect(replay.errors).toEqual([]);
		expect(persisted).toEqual([{ ...original, ets: '2027-05-01' }]);
	});

	it('skips equal repeated rows using the latest acknowledged dates rather than the original read snapshot', async () => {
		const ctx = buildContext();
		const original = savedPerson('person-one', 'Smith');
		const persisted = freshPersonnelProvider(ctx, [original]);
		const record = { rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' };

		const result = await mergePersonnelBatch(ctx, { records: [record, { ...record, deros: '' }] });

		expect.soft(result.updated).toHaveLength(1);
		expect.soft(result.skipped).toEqual([{ index: 1, message: expect.any(String) }]);
		expect(result.errors).toEqual([]);
		expect(persisted).toEqual([{ ...original, ets: '2027-05-01' }]);
	});

	// This is the newly explicit sequential file-order rule, not a claim that
	// contradictory repeated rows had an approved historical winner policy.
	it('applies a later conflicting date against acknowledged state in file order', async () => {
		const ctx = buildContext();
		const original = savedPerson('person-one', 'Smith', '2027-01-01');
		const persisted = freshPersonnelProvider(ctx, [original]);
		const person = { rank: 'SGT', lastName: 'Smith', firstName: 'Jamie' };

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{ ...person, ets: '2027-05-01' },
				{ ...person, ets: '2027-01-01', deros: '' }
			]
		});

		expect.soft(persisted).toEqual([original]);
		expect.soft(result.updated).toMatchObject([
			{ id: original.id, ets: '2027-05-01', deros: '2028-06-01' },
			{ id: original.id, ets: '2027-01-01', deros: '2028-06-01' }
		]);
		expect.soft(result.skipped).toEqual([]);
		expect(result.errors).toEqual([]);
	});

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

	it('updates ETS and DEROS for an existing personnel row that keeps a retired rank', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SP4',
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
					rank: 'sp4',
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
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-1',
				rank: 'SP4',
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(1);
		expect(personnel[0]).toMatchObject({
			id: 'person-1',
			rank: 'SP4',
			ets: '2027-05-01',
			deros: '2026-11-30'
		});
	});

	it('matches legacy-cased stored ranks through the Organization rank catalog', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'sgt',
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
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-1',
				rank: 'sgt',
				ets: '2027-05-01'
			})
		]);
	});

	it('matches legacy ranks case-insensitively when they collide with multiple catalog entries by case', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [
			{ code: 'CAPT', label: 'Captain', service: 'navy', category: 'officer', pay_grade: 'O-6' },
			{ code: 'Capt', label: 'Captain', service: 'air-force', category: 'officer', pay_grade: 'O-3' }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'person-legacy-capt',
				organization_id: 'test-org',
				rank: 'capt',
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
					rank: 'cApT',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '2027-05-01'
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-legacy-capt',
				rank: 'capt',
				ets: '2027-05-01'
			})
		]);
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

	it('rejects unknown rank inputs with Organization rank catalog guidance', async () => {
		const ctx = buildContext();

		const result = await mergePersonnelBatch(ctx, {
			records: [
				{
					rank: 'UNKNOWN',
					lastName: 'Smith',
					firstName: 'Jamie',
					ets: '2027-05-01'
				}
			]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.errors).toEqual([
			{
				index: 0,
				message: expect.stringMatching(/"UNKNOWN".*Unit settings > Ranks/)
			}
		]);
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

	it('allows operator-level direct merge calls through the policy gate', async () => {
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

		const result = await mergePersonnelBatch(ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }]
		});

		expect(result.errors).toEqual([{ index: 0, message: 'No active personnel row matched this record' }]);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel'
			})
		);
	});

	it('does not reveal out-of-scope personnel through direct merge matching', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
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

		const result = await mergePersonnelBatch(ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }]
		});

		expect(result.updated).toHaveLength(0);
		expect(result.errors).toEqual([{ index: 0, message: 'No active personnel row matched this record' }]);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});
