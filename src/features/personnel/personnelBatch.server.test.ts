import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { importPersonnelBatch } from './personnelBatch.server';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = createWritePortsContext(overrides);
	seedRankCatalog(ctx, [
		{ code: 'PFC', label: 'Private First Class', pay_grade: 'E-3' },
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

function atomicImportProvider(
	ctx: ReturnType<typeof buildContext>,
	originals: Array<Record<string, unknown>>,
	writeError?: unknown
) {
	const persisted = structuredClone(originals);
	const attemptedBatches: string[][] = [];
	const findMany = ctx.store.findMany.bind(ctx.store);
	ctx.store.findMany = async <T>(...args: Parameters<typeof ctx.store.findMany>): Promise<T[]> => {
		const [table, orgId] = args;
		if (table !== 'personnel') return findMany<T>(...args);
		return structuredClone(
			persisted.filter((row) => row.organization_id === orgId && row.group_id === 'group-alpha')
		) as T[];
	};
	// Validate the entire write before persisting any row. The ordinary read
	// never reveals Bravo rows, but uniqueness still applies to the Organization.
	ctx.store.insertMany = async <T>(table: string, orgId: string, rows: Record<string, unknown>[]): Promise<T[]> => {
		if (table !== 'personnel') throw new Error('Unexpected provider table');
		attemptedBatches.push(rows.map((row) => row.slug as string));
		if (writeError !== undefined) throw writeError;
		const used = new Set(persisted.filter((row) => row.organization_id === orgId).map((row) => row.slug));
		for (const row of rows) {
			if (used.has(row.slug)) {
				throw Object.assign(new Error('duplicate key value violates unique constraint "personnel_org_slug_key"'), {
					code: '23505',
					details: `Key (organization_id, slug)=(${orgId}, ${row.slug}) already exists.`
				});
			}
			used.add(row.slug);
		}
		const inserted = rows.map((row) => ({ ...row, id: crypto.randomUUID(), organization_id: orgId }));
		persisted.push(...structuredClone(inserted));
		return structuredClone(inserted) as T[];
	};
	return { persisted, attemptedBatches };
}

describe('importPersonnelBatch', () => {
	it('advances a hidden Group URL collision while preserving unrelated bulk names and rows', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		ctx.store.seed('groups', [{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha' }]);
		const hidden = {
			id: 'hidden-bravo',
			organization_id: ctx.auth.orgId,
			group_id: 'group-bravo',
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jamie',
			slug: 'smith-jamie',
			ets: '2028-07-01',
			archived_at: null
		};
		const { persisted } = atomicImportProvider(ctx, [hidden]);

		const outcome = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', groupName: 'Alpha' },
				{ rank: 'SGT', lastName: 'Rivera', firstName: 'Monica', groupName: 'Alpha' }
			]
		}).then(
			(value) => ({ value, error: null }),
			(error: unknown) => ({ value: null, error })
		);

		expect(persisted.find((row) => row.id === hidden.id)).toEqual(hidden);
		expect.soft(outcome.error).toBeNull();
		expect.soft(outcome.value).toMatchObject({
			inserted: [
				{ slug: 'smith-jamie-2', groupId: 'group-alpha' },
				{ slug: 'rivera-monica', groupId: 'group-alpha' }
			],
			errors: []
		});
		expect
			.soft(persisted.filter((row) => row.group_id === 'group-alpha'))
			.toEqual([
				expect.objectContaining({ id: expect.any(String), slug: 'smith-jamie-2', last_name: 'Smith' }),
				expect.objectContaining({ id: expect.any(String), slug: 'rivera-monica', last_name: 'Rivera' })
			]);
		expect.soft(ctx.audit.events).toContainEqual({
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			details: { count: 2 }
		});
	});

	it('stops after three confirmed occupied candidates without persisting any part of the bulk', async () => {
		const ctx = buildContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } } });
		ctx.store.seed('groups', [{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha' }]);
		const originals = ['smith-jamie', 'smith-jamie-2', 'smith-jamie-3'].map((slug, index) => ({
			id: `hidden-${index}`,
			organization_id: ctx.auth.orgId,
			group_id: 'group-bravo',
			slug
		}));
		const provider = atomicImportProvider(ctx, originals);

		await expect(
			importPersonnelBatch(ctx, {
				records: [
					{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', groupName: 'Alpha' },
					{ rank: 'SGT', lastName: 'Rivera', firstName: 'Monica', groupName: 'Alpha' }
				]
			})
		).rejects.toMatchObject({ code: '23505' });
		expect(provider.attemptedBatches).toEqual([
			['smith-jamie', 'rivera-monica'],
			['smith-jamie-2', 'rivera-monica'],
			['smith-jamie-3', 'rivera-monica']
		]);
		expect(provider.persisted).toEqual(originals);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		['an arbitrary provider failure', new Error('Provider connection lost')],
		[
			'a slug conflict without a confirmed candidate',
			Object.assign(new Error('duplicate key value violates unique constraint "personnel_org_slug_key"'), {
				code: '23505'
			})
		]
	])('does not retry %s or report successful creation', async (_reason, error) => {
		const ctx = buildContext();
		const provider = atomicImportProvider(ctx, [], error);

		await expect(
			importPersonnelBatch(ctx, { records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie' }] })
		).rejects.toBe(error);
		expect(provider.attemptedBatches).toEqual([['smith-jamie']]);
		expect(provider.persisted).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects empty records array', async () => {
		const ctx = buildContext();
		await expect(importPersonnelBatch(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('rejects batches over 500 records', async () => {
		const ctx = buildContext();
		const records = Array.from({ length: 501 }, (_, i) => ({
			rank: 'SGT',
			lastName: `Last${i}`,
			firstName: `First${i}`
		}));
		await expect(importPersonnelBatch(ctx, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});

	it('imports all 500 valid rows without a subscription provider', async () => {
		const ctx = buildContext();
		const insertMany = ctx.store.insertMany.bind(ctx.store);
		const batches: number[] = [];
		ctx.store.insertMany = async <T>(...args: Parameters<typeof ctx.store.insertMany>): Promise<T[]> => {
			batches.push(args[2].length);
			return insertMany<T>(...args);
		};
		const records = Array.from({ length: 500 }, (_, i) => ({
			rank: 'SGT',
			lastName: `Last${i}`,
			firstName: `First${i}`
		}));
		const result = await importPersonnelBatch(ctx, { records });
		expect(result.errors).toEqual([]);
		expect(result.inserted).toHaveLength(500);
		expect(batches).toEqual([500]);
		await expect(ctx.store.findMany('personnel', ctx.auth.orgId)).resolves.toHaveLength(500);
		expect(ctx.audit.events).toContainEqual({
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			details: { count: 500 }
		});
	});

	it('returns per-record errors for invalid ranks', async () => {
		const ctx = buildContext();
		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'INVALID', lastName: 'Smith', firstName: 'John' },
				{ rank: 'SGT', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({
			index: 0,
			message:
				'Unknown rank "INVALID". Update the Organization rank catalog in Organization Settings -> Ranks, then try again.'
		});
	});

	it('normalizes imported rank input through the active Organization rank catalog', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [
			{
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				pay_grade: 'E-4'
			}
		]);

		const result = await importPersonnelBatch(ctx, {
			records: [{ rank: 'po3', lastName: 'Nolan', firstName: 'Avery' }]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.inserted).toMatchObject([{ rank: 'PO3' }]);
		await expect(ctx.store.findMany('personnel', ctx.auth.orgId)).resolves.toEqual([
			expect.objectContaining({ rank: 'PO3' })
		]);
	});

	it('rejects retired Organization catalog ranks during import', async () => {
		const ctx = buildContext();
		seedRankCatalog(ctx, [{ code: 'SP4', label: 'Specialist Four', pay_grade: 'E-4', state: 'retired' }]);

		const result = await importPersonnelBatch(ctx, {
			records: [{ rank: 'SP4', lastName: 'Legacy', firstName: 'Sam' }]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toEqual([
			{
				index: 0,
				message:
					'Rank "SP4" is retired. Reactivate it in the Organization rank catalog before using it for Personnel create, edit, or import.'
			}
		]);
	});

	it('returns errors for missing required fields', async () => {
		const ctx = buildContext();
		const result = await importPersonnelBatch(ctx, {
			records: [{ rank: '', lastName: 'Smith', firstName: 'John' }]
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('required');
	});

	it('enforces scoped group restriction', async () => {
		const ctx = buildContext({
			auth: { scopeSet: { kind: 'groups', groupIds: ['group-1'] } }
		});
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John', groupName: 'Alpha' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' } // no group — won't match scoped group
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('only add personnel to your assigned group');
	});

	it('preserves ETS and DEROS values from bulk import records', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'John',
					ets: '2027-05-01',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toMatchObject({
			ets: '2027-05-01',
			deros: '2026-11-30'
		});

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel[0]).toMatchObject({
			ets: '2027-05-01',
			deros: '2026-11-30'
		});
	});

	it('generates unique Personnel Slugs for imported records', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'SSG', lastName: 'Smith', firstName: 'John' }
			]
		});

		expect(result.inserted).toMatchObject([{ slug: 'smith-john' }, { slug: 'smith-john-2' }]);

		const personnel = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(personnel.map((person) => person.slug)).toEqual(['smith-john', 'smith-john-2']);
	});

	it('rejects malformed ETS and DEROS date strings during bulk import', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'John',
					ets: '12/25/2026'
				},
				{
					rank: 'PFC',
					lastName: 'Doe',
					firstName: 'Jane',
					deros: '2026-02-30'
				}
			]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toEqual([
			{ index: 0, message: 'ETS must be a valid YYYY-MM-DD date' },
			{ index: 1, message: 'DEROS must be a valid YYYY-MM-DD date' }
		]);

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(0);
	});

	it('logs audit event with count', async () => {
		const ctx = buildContext();
		await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			details: { count: 2 }
		});
	});

	it('validates and inserts valid records', async () => {
		const ctx = buildContext();

		// Seed groups for name matching
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John', groupName: 'Alpha' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});

		expect(result.inserted).toHaveLength(2);
		expect(result.errors).toHaveLength(0);

		// Verify records in store
		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(2);
	});
});
