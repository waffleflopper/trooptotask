import { describe, expect, it } from 'vitest';
import { createSupabaseTrainingCatalogPersistence } from './trainingCatalogPersistence.server';
import { createSupabaseTrainingCompletionPersistence } from './trainingCompletionPersistence.server';
import { trainingProvider } from './test-support/trainingProvider.server';

const ORG = 'org-a';
const TIME = '2026-10-07T12:00:00.123456Z';

function ports(initial: Parameters<typeof trainingProvider>[0]) {
	const provider = trainingProvider(initial);
	return {
		...provider,
		catalog: createSupabaseTrainingCatalogPersistence(provider.client, ORG),
		completions: createSupabaseTrainingCompletionPersistence(provider.client, ORG)
	};
}

describe('ordinary Training persistence', () => {
	it('retains saved metadata and known present-null defaults without materializing omitted leaves', async () => {
		const { catalog, completions } = ports({
			training_types: [
				{
					id: 'null',
					organization_id: ORG,
					created_at: TIME,
					name: 'Null',
					description: null,
					applies_to_roles: null,
					applies_to_mos: null,
					applies_to_ranks: null,
					excluded_roles: null,
					excluded_mos: null,
					excluded_ranks: null,
					exempt_personnel_ids: null,
					expiration_date_only: null,
					can_be_exempted: null,
					is_optional: null,
					expiration_months: null,
					sort_order: 1,
					color: '#123456',
					warning_days_yellow: 60,
					warning_days_orange: 30
				},
				{ id: 'omitted', organization_id: ORG, name: 'Omitted', sort_order: 2 }
			],
			training_views: [
				{
					id: 'v1',
					organization_id: ORG,
					name: 'A',
					column_ids: null,
					created_by: 'actor-a',
					created_at: TIME,
					updated_at: TIME
				},
				{ id: 'v2', organization_id: ORG, name: 'B' }
			],
			personnel_trainings: [
				{
					id: 'r1',
					organization_id: ORG,
					personnel_id: 'p1',
					training_type_id: 'null',
					completion_date: null,
					expiration_date: null,
					notes: null,
					certificate_url: null,
					created_at: TIME,
					updated_at: TIME
				},
				{ id: 'r2', organization_id: ORG, personnel_id: 'p1', training_type_id: 'omitted' }
			]
		});
		expect(await catalog.listTypes()).toEqual([
			{
				id: 'null',
				organization_id: ORG,
				created_at: TIME,
				name: 'Null',
				description: null,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				exemptPersonnelIds: [],
				expirationDateOnly: false,
				canBeExempted: false,
				isOptional: false,
				expirationMonths: null,
				sortOrder: 1,
				color: '#123456',
				warningDaysYellow: 60,
				warningDaysOrange: 30
			},
			{ id: 'omitted', organization_id: ORG, name: 'Omitted', sortOrder: 2 }
		]);
		expect(await catalog.listViews()).toEqual([
			{
				id: 'v1',
				organization_id: ORG,
				name: 'A',
				columnIds: [],
				createdBy: 'actor-a',
				createdAt: TIME,
				updatedAt: TIME
			},
			{ id: 'v2', organization_id: ORG, name: 'B' }
		]);
		expect(await completions.listCompletions()).toEqual([
			{
				id: 'r1',
				organization_id: ORG,
				personnelId: 'p1',
				trainingTypeId: 'null',
				completionDate: null,
				expirationDate: null,
				notes: null,
				certificateUrl: null,
				created_at: TIME,
				updated_at: TIME
			},
			{ id: 'r2', organization_id: ORG, personnelId: 'p1', trainingTypeId: 'omitted' }
		]);
		expect(await catalog.findTypeTiming('null')).toEqual({ expirationMonths: null, expirationDateOnly: null });
		expect(await catalog.listTypeImportReferences(['null'])).toEqual([
			{ id: 'null', expirationMonths: null, expirationDateOnly: null, canBeExempted: null, exemptPersonnelIds: null }
		]);
		expect(await catalog.listRankApplicabilityReferences()).toEqual([
			{ appliesToRanks: null, excludedRanks: null },
			{}
		]);
	});

	it('captures ordinary client and Organization for ordered catalogs, references, counts and every write', async () => {
		const { catalog, completions, state } = ports({
			training_types: [
				{
					id: 't1',
					organization_id: ORG,
					name: 'Annual',
					sort_order: 2,
					expiration_months: 12,
					expiration_date_only: false
				},
				{ id: 't0', organization_id: ORG, name: 'Never', sort_order: 1 },
				{ id: 'foreign', organization_id: 'org-b', name: 'Annual', sort_order: 0 }
			],
			personnel_trainings: [
				{
					id: 'r1',
					organization_id: ORG,
					personnel_id: 'p1',
					training_type_id: 't1',
					completion_date: '2026-01-01',
					expiration_date: null,
					notes: 'keep',
					certificate_url: 'saved-url'
				},
				{ id: 'foreign-r', organization_id: 'org-b', personnel_id: 'p1', training_type_id: 't1' }
			]
		});
		expect((await catalog.listTypes()).map((row) => row.id)).toEqual(['t0', 't1']);
		expect(await catalog.listTypeLabels()).toEqual([
			{ id: 't0', name: 'Never' },
			{ id: 't1', name: 'Annual' }
		]);
		expect(await catalog.countTypesEstimated()).toBe(2);
		state.countNull = true;
		expect(await catalog.countTypesEstimated()).toBe(0);
		expect(await catalog.hasTypes()).toBe(true);
		expect(await catalog.listExistingTypeNames(['Annual'])).toEqual(['Annual']);
		expect((await catalog.findTypeByName('Annual'))?.id).toBe('t1');
		expect(await catalog.findTypeId('t1')).toEqual({ id: 't1' });
		expect(await completions.findResource('r1')).toEqual({ personnelId: 'p1', trainingTypeId: 't1' });
		expect(await completions.findPair('p1', 't1')).toEqual({ id: 'r1' });
		expect(await completions.listPairReferences(['p1'], ['t1'])).toEqual([
			{ id: 'r1', personnelId: 'p1', trainingTypeId: 't1' }
		]);
		expect(await completions.listPersonReadinessFacts('p1')).toEqual([{ trainingTypeId: 't1', expirationDate: null }]);
		expect(await completions.listPersonExportFacts('p1')).toEqual([
			{ trainingTypeId: 't1', completionDate: '2026-01-01', expirationDate: null, notes: 'keep' }
		]);
		const type = await catalog.createType({ name: 'New' });
		expect(type).toMatchObject({
			organization_id: ORG,
			created_at: TIME,
			description: null,
			expirationMonths: null,
			warningDaysYellow: 60,
			warningDaysOrange: 30,
			color: '#6b7280',
			appliesToRoles: [],
			exemptPersonnelIds: [],
			isOptional: false
		});
		expect(await catalog.patchType(type.id, { name: 'Renamed', expirationMonths: null })).toMatchObject({
			id: type.id,
			name: 'Renamed',
			expirationMonths: null
		});
		const view = await catalog.createView({ name: 'View' });
		expect(view).toEqual({
			id: view.id,
			name: 'View',
			columnIds: [],
			organization_id: ORG,
			createdBy: 'actor-a',
			createdAt: TIME,
			updatedAt: TIME
		});
		expect(await catalog.patchView(view.id, { columnIds: ['t1'] })).toMatchObject({ name: 'View', columnIds: ['t1'] });
		const record = await completions.createRecord({ personnelId: 'p2', trainingTypeId: 't1' });
		expect(record).toMatchObject({
			personnelId: 'p2',
			trainingTypeId: 't1',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null,
			organization_id: ORG,
			created_at: TIME,
			updated_at: TIME
		});
		expect(
			await completions.patchRecord(record.id, { notes: 'changed', updatedAt: '2026-10-07T13:00:00Z' })
		).toMatchObject({ id: record.id, completionDate: null, notes: 'changed', updated_at: '2026-10-07T13:00:00Z' });
		const saved = await completions.upsertCompleted([
			{
				personnelId: 'p1',
				trainingTypeId: 't1',
				completionDate: '2026-02-01',
				expirationDate: '2027-02-01',
				notes: null,
				updatedAt: TIME
			}
		]);
		expect(saved).toMatchObject([
			{ id: 'r1', certificateUrl: 'saved-url', completionDate: '2026-02-01', expirationDate: '2027-02-01' }
		]);
		await catalog.deleteType(type.id);
		await catalog.deleteView(view.id);
		await completions.deleteRecord(record.id);
		expect(state.rows.training_types.map((row) => row.id)).toEqual(['t1', 't0', 'foreign']);
		expect(state.rows.training_views).toEqual([]);
		expect(state.rows.personnel_trainings.map((row) => row.id)).toEqual(['r1', 'foreign-r']);
		expect(
			state.requests
				.filter((r) => r.method === 'GET' || r.method === 'PATCH' || r.method === 'DELETE')
				.every((r) => r.url.searchParams.get('organization_id') === 'eq.org-a')
		).toBe(true);
	});

	it('preserves missing single-row semantics and propagates other provider failures', async () => {
		const { catalog, completions, state } = ports({
			training_types: [{ id: 't1', organization_id: ORG, name: 'Annual' }]
		});
		expect(await catalog.findTypeByName('Annual')).toMatchObject({ id: 't1', name: 'Annual' });
		expect(await catalog.findTypeByName('Missing')).toBeNull();
		expect(await catalog.findTypeTiming('missing')).toBeNull();
		expect(await catalog.findTypeId('missing')).toBeNull();
		expect(await completions.findResource('missing')).toBeNull();
		expect(await completions.findPair('missing', 't1')).toBeNull();
		state.failure = () => ({ code: '42501', message: 'Denied', status: 403 });
		await expect(catalog.findTypeTiming('t1')).rejects.toThrow('Denied');
		await expect(catalog.patchType('t1', { name: 'no' })).rejects.toThrow('Denied');
		await expect(completions.createRecord({ personnelId: 'p1', trainingTypeId: 't1' })).rejects.toThrow('Denied');
	});

	it.each([
		'types',
		'views',
		'labels',
		'names',
		'ranks',
		'imports',
		'completions',
		'pairs',
		'readiness',
		'export'
	] as const)('pages tied %s completely under changing provider order and rejects a later error', async (method) => {
		const ids = Array.from({ length: 1001 }, (_, i) => `row-${String(i).padStart(4, '0')}`);
		const source = ids.map((id) => ({
			id,
			organization_id: ORG,
			name: `Name ${id}`,
			sort_order: 1,
			personnel_id: 'p1',
			training_type_id: id,
			applies_to_ranks: [id],
			expiration_date: null
		}));
		const { catalog, completions, state } = ports({
			training_types: source,
			training_views: source.map((row) => ({ ...row, name: 'Same name' })),
			personnel_trainings: source
		});
		state.unstablePages = true;
		const read = () =>
			({
				types: async () => (await catalog.listTypes()).map((row) => row.id),
				views: async () => (await catalog.listViews()).map((row) => row.id),
				labels: async () => (await catalog.listTypeLabels()).map((row) => row.id),
				names: () => catalog.listExistingTypeNames(source.map((row) => row.name)),
				ranks: async () => (await catalog.listRankApplicabilityReferences()).map((row) => row.appliesToRanks),
				imports: async () => (await catalog.listTypeImportReferences(ids)).map((row) => row.id),
				completions: async () => (await completions.listCompletions()).map((row) => row.id),
				pairs: async () => (await completions.listPairReferences(['p1'], ids)).map((row) => row.id),
				readiness: async () => (await completions.listPersonReadinessFacts('p1')).map((row) => row.trainingTypeId),
				export: async () => (await completions.listPersonExportFacts('p1')).map((row) => row.trainingTypeId)
			})[method]();
		expect(await read()).toEqual(
			method === 'names' ? ids.map((id) => `Name ${id}`) : method === 'ranks' ? ids.map((id) => [id]) : ids
		);
		state.failure = (r) => (r.offset >= 1000 ? { code: '42501', message: 'Late failure', status: 403 } : null);
		await expect(read()).rejects.toThrow('Late failure');
	});

	it('turns a duplicate type name into a public 409 and a missing patch into null', async () => {
		const saved = { id: 't1', organization_id: ORG, name: 'Annual' };
		const { catalog, state } = ports({ training_types: [saved] });
		state.failure = (r) =>
			r.method === 'POST' || r.method === 'PATCH'
				? {
						code: '23505',
						message: 'duplicate key value violates unique constraint "training_types_clinic_id_name_key"',
						status: 409
					}
				: null;
		const conflict = { status: 409, message: 'A Training type with that name already exists.' };
		await expect(catalog.createType({ name: 'Annual' })).rejects.toMatchObject(conflict);
		await expect(catalog.patchType('t1', { name: 'Annual' })).rejects.toMatchObject(conflict);
		state.failure = null;
		expect(await catalog.patchType('missing', { name: 'Renamed' })).toBeNull();
		expect(await catalog.patchView('missing', { name: 'Renamed' })).toBeNull();
		expect(state.rows.training_types).toEqual([saved]);
	});
});
