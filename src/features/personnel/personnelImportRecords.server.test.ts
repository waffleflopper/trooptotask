import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { importPersonnelRecords } from './personnelImportRecords.server';
import { createSupabasePersonnelRecordPersistence } from './personnelRecordPersistence.server';
import { personnelProvider } from './test-support/personnelProvider';
import { personnelImportRecordsInputSchema } from './personnelImportRecords.contracts';

function context(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = withPersonnelPersistence(createWritePortsContext(overrides));
	ctx.store.seed('organization_rank_catalog', [
		{
			organization_id: 'test-org',
			code: 'SGT',
			state: 'active',
			pay_grade: 'E-5',
			category: 'enlisted',
			service: 'army',
			sort_order: 0
		},
		{
			organization_id: 'test-org',
			code: 'SSG',
			state: 'active',
			pay_grade: 'E-6',
			category: 'enlisted',
			service: 'army',
			sort_order: 1
		},
		{
			organization_id: 'test-org',
			code: 'SP4',
			state: 'retired',
			pay_grade: 'E-4',
			category: 'enlisted',
			service: 'army',
			sort_order: 2
		}
	]);
	ctx.store.seed('groups', [
		{ id: 'alpha', organization_id: 'test-org', name: 'Alpha' },
		{ id: 'bravo', organization_id: 'test-org', name: 'Bravo' },
		{ id: 'foreign', organization_id: 'other-org', name: 'Foreign' }
	]);
	ctx.store.seed('personnel', [
		{
			id: 'person-a',
			organization_id: 'test-org',
			group_id: 'alpha',
			rank: 'SGT',
			first_name: 'Jamie',
			last_name: 'Smith',
			slug: 'smith-jamie',
			mos: '68W',
			clinic_role: 'Medic',
			ets: '2028-05-01',
			deros: '2027-11-30',
			archived_at: null
		},
		{
			id: 'person-b',
			organization_id: 'test-org',
			group_id: 'bravo',
			rank: 'SGT',
			first_name: 'Morgan',
			last_name: 'Jones',
			slug: 'jones-morgan',
			mos: '68C',
			clinic_role: 'Nurse',
			archived_at: null
		},
		...['person-c', 'person-d'].map((id) => ({
			id,
			organization_id: 'test-org',
			group_id: 'alpha',
			rank: 'SGT',
			first_name: 'Synthetic',
			last_name: id,
			mos: '68W',
			clinic_role: 'Medic',
			ets: '2028-05-01',
			deros: '2027-11-30',
			archived_at: null
		})),
		{
			id: 'archived',
			organization_id: 'test-org',
			group_id: 'alpha',
			rank: 'SGT',
			first_name: 'Alex',
			last_name: 'Archived',
			slug: 'archived-alex',
			mos: '68V',
			archived_at: '2026-10-01T00:00:00Z'
		},
		{
			id: 'foreign-person',
			organization_id: 'other-org',
			group_id: 'foreign',
			rank: 'SGT',
			first_name: 'Taylor',
			last_name: 'Foreign',
			mos: '68X',
			archived_at: null
		}
	]);
	return ctx;
}

describe('importPersonnelRecords', () => {
	it('normalizes ID input and treats blank IDs as omitted while retaining row-level format failures', async () => {
		const input = personnelImportRecordsInputSchema.parse({
			records: [
				{ op: 'update', personnelId: 'person-a', changes: { dodId: ' 012-345 6789 ' } },
				{ op: 'update', personnelId: 'person-b', changes: { dodId: ' - ', mos: '68V' } },
				{ op: 'update', personnelId: 'person-c', changes: { dodId: 'bad', mos: 'BAD' } }
			]
		});
		expect(input.records).toEqual([
			{ op: 'update', personnelId: 'person-a', changes: { dodId: '0123456789' } },
			{ op: 'update', personnelId: 'person-b', changes: { dodId: undefined, mos: '68V' } },
			{ op: 'update', personnelId: 'person-c', changes: { dodId: 'bad', mos: 'BAD' } }
		]);
		const ctx = context();
		const result = await importPersonnelRecords(ctx, input);
		expect(result).toMatchObject({
			updated: [{ id: 'person-a' }, { id: 'person-b', mos: '68V' }],
			errors: [{ kind: 'failed', index: 2 }]
		});
		await expect(ctx.personnel.findById('person-c')).resolves.toMatchObject({ mos: '68W' });
		await expect(ctx.personnelSheets.listDodIds()).resolves.toEqual([{ personnelId: 'person-a', dodId: '0123456789' }]);
	});

	it('rejects duplicate and occupied IDs, including archived holders, before their Person writes', async () => {
		const ctx = context();
		ctx.store.seed('personnel_extended_info', [
			{ id: 'archived-sheet', organization_id: 'test-org', personnel_id: 'archived', dod_id: '0000000001' },
			{ id: 'active-sheet', organization_id: 'test-org', personnel_id: 'person-b', dod_id: '0000000002' }
		]);
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'Free', lastName: 'Synthetic', dodId: '0123456789' },
				{ op: 'update', personnelId: 'person-a', changes: { dodId: '012-3456789', mos: 'BAD' } },
				{ op: 'create', rank: 'SGT', firstName: 'Taken', lastName: 'Archived', dodId: '0000000001' },
				{ op: 'update', personnelId: 'person-c', changes: { dodId: '0000000002', mos: 'BAD' } },
				{ op: 'update', personnelId: 'person-d', changes: { dodId: '123', mos: 'BAD' } }
			]
		});
		expect(result).toMatchObject({
			created: [{ firstName: 'Free', lastName: 'Synthetic' }],
			updated: [],
			errors: [
				{ kind: 'failed', index: 1 },
				{ kind: 'failed', index: 2 },
				{ kind: 'failed', index: 3 },
				{ kind: 'failed', index: 4 }
			]
		});
		for (const id of ['person-a', 'person-c', 'person-d']) {
			await expect(ctx.personnel.findById(id)).resolves.toMatchObject({ mos: '68W' });
		}
		await expect(ctx.store.findMany('personnel', 'test-org', { first_name: 'Taken' })).resolves.toEqual([]);
	});

	it('writes IDs on create and update, preserving unrelated Data Sheet values and omitted IDs', async () => {
		const ctx = context();
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'sheet-a',
				organization_id: 'test-org',
				personnel_id: 'person-a',
				dod_id: '0000000001',
				blood_type: 'O+',
				children: [{ name: 'Synthetic' }],
				award_tracking_acknowledged_at: '2026-10-01T10:00:00Z'
			}
		]);
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Synthetic', dodId: '0123456789' },
				{ op: 'update', personnelId: 'person-a', changes: { dodId: '0000000002' } },
				{ op: 'update', personnelId: 'person-b', changes: { dodId: ' - ', mos: '68V' } }
			]
		});
		expect(result).toMatchObject({
			created: [{ firstName: 'New' }],
			updated: [
				{ id: 'person-a', rank: 'SGT', mos: '68W' },
				{ id: 'person-b', mos: '68V' }
			],
			errors: []
		});
		await expect(ctx.personnelSheets.findSheetForPerson(result.created[0].id)).resolves.toMatchObject({
			dod_id: '0123456789',
			updated_by: ctx.auth.userId
		});
		await expect(ctx.personnelSheets.findSheetForPerson('person-a')).resolves.toMatchObject({
			id: 'sheet-a',
			dod_id: '0000000002',
			blood_type: 'O+',
			children: [{ name: 'Synthetic' }],
			updated_by: ctx.auth.userId
		});
		await importPersonnelRecords(ctx, {
			records: [{ op: 'update', personnelId: 'person-a', changes: { dodId: '', mos: '68V' } }]
		});
		await expect(ctx.personnelSheets.findSheetForPerson('person-a')).resolves.toMatchObject({ dod_id: '0000000002' });
		await expect(ctx.personnelSheets.findSheetForPerson('person-b')).resolves.toBeNull();
	});

	it('keeps Person writes and reports exact rows when ID writes conflict after validation', async () => {
		const ctx = context();
		const save = ctx.personnelSheets.saveDodIds;
		ctx.personnelSheets.saveDodIds = async (rows) => {
			ctx.store.seed('personnel_extended_info', [
				{ id: 'racing-sheet', organization_id: 'test-org', personnel_id: 'archived', dod_id: '0123456789' }
			]);
			return save(rows);
		};
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Synthetic', dodId: '0123456789' },
				{ op: 'update', personnelId: 'person-a', changes: { dodId: '0000000001', mos: '68V' } }
			]
		});
		expect(result).toMatchObject({
			created: [{ firstName: 'New' }],
			updated: [{ id: 'person-a', mos: '68V' }],
			errors: [
				{ kind: 'failed', index: 0, message: expect.stringMatching(/Person was saved.*DoD ID was not.*already has/) }
			]
		});
		await expect(ctx.personnel.findById(result.created[0].id)).resolves.toMatchObject({ firstName: 'New' });
		await expect(ctx.personnelSheets.findSheetForPerson(result.created[0].id)).resolves.toBeNull();
		await expect(ctx.personnelSheets.findSheetForPerson('person-a')).resolves.toMatchObject({ dod_id: '0000000001' });
		expect(ctx.audit.events).toMatchObject([
			{ action: 'personnel.bulk_merged', details: { created: 1, updated: 1, errors: 1 } }
		]);
	});

	it('stops hidden active and archived ID conflicts before creating or updating a Person', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					personnel: 'operate',
					calendar: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			}
		});
		await ctx.store.update('personnel', 'test-org', 'archived', { group_id: 'bravo' });
		ctx.store.seed('personnel_extended_info', [
			{ id: 'hidden-active', organization_id: 'test-org', personnel_id: 'person-b', dod_id: '0000000001' },
			{ id: 'hidden-archived', organization_id: 'test-org', personnel_id: 'archived', dod_id: '0000000002' },
			{ id: 'foreign', organization_id: 'other-org', personnel_id: 'foreign-person', dod_id: '0000000003' }
		]);
		await expect(ctx.personnelSheets.listDodIds()).resolves.toEqual([]);
		await expect(
			ctx.personnelSheets.findDodIdsInUse(['0000000001', '0000000002', '0000000003', '0000000004'])
		).resolves.toEqual(['0000000001', '0000000002']);
		const result = await importPersonnelRecords(ctx, {
			records: [
				{
					op: 'create',
					rank: 'SGT',
					firstName: 'Rejected',
					lastName: 'Synthetic',
					groupId: 'alpha',
					dodId: '0000000001'
				},
				{ op: 'update', personnelId: 'person-a', changes: { dodId: '0000000002', mos: 'BAD' } },
				{ op: 'create', rank: 'SGT', firstName: 'Free', lastName: 'Synthetic', groupId: 'alpha', dodId: '0000000003' }
			]
		});
		expect(result).toMatchObject({
			created: [{ firstName: 'Free' }],
			updated: [],
			errors: [
				{
					kind: 'failed',
					index: 0,
					message: expect.stringMatching(/outside the Groups.*Organization admin.*move them.*import again/)
				},
				{
					kind: 'failed',
					index: 1,
					message: expect.stringMatching(/outside the Groups.*Organization admin.*move them.*import again/)
				}
			]
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68W' });
		await expect(ctx.store.findMany('personnel', 'test-org', { first_name: 'Rejected' })).resolves.toEqual([]);
		await expect(ctx.personnelSheets.findSheetForPerson('person-a')).resolves.toBeNull();
		await expect(ctx.personnelSheets.findSheetForPerson(result.created[0].id)).resolves.toMatchObject({
			dod_id: '0000000003'
		});
	});
	it('updates a person created by an earlier import', async () => {
		const ctx = context();
		const first = await importPersonnelRecords(ctx, {
			records: [{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' }]
		});
		const personnelId = first.created[0].id;
		const result = await importPersonnelRecords(ctx, {
			records: [{ op: 'update', personnelId, changes: { mos: '68V' } }]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: personnelId, firstName: 'New', lastName: 'Person', mos: '68V' }],
			errors: []
		});
		await expect(ctx.personnel.findById(personnelId)).resolves.toMatchObject({
			firstName: 'New',
			lastName: 'Person',
			mos: '68V',
			archivedAt: null
		});
	});

	it('does not change a Person archived after the import references were loaded', async () => {
		const ctx = context();
		const { client, state } = personnelProvider({
			personnel: [
				{
					id: 'person-a',
					organization_id: 'test-org',
					rank: 'SGT',
					first_name: 'Jamie',
					last_name: 'Smith',
					group_id: 'alpha',
					mos: '68W',
					clinic_role: 'Medic',
					archived_at: null
				}
			]
		});
		const personnel = createSupabasePersonnelRecordPersistence(client, 'test-org');
		const references = personnel.listArchiveCandidates;
		personnel.listArchiveCandidates = async (ids) => {
			const people = await references(ids);
			state.rows.personnel[0].archived_at = '2026-10-22T12:00:00Z';
			return people;
		};
		const result = await importPersonnelRecords(
			{ ...ctx, personnel },
			{ records: [{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } }] }
		);
		expect(result).toMatchObject({
			created: [],
			updated: [],
			errors: [{ index: 0, message: expect.stringMatching(/active personnel/) }]
		});
		expect(state.rows.personnel).toEqual([
			expect.objectContaining({ id: 'person-a', mos: '68W', archived_at: '2026-10-22T12:00:00Z' })
		]);
	});

	it('updates 500 people when an unbounded ID filter exceeds the provider URL limit', async () => {
		const ctx = context();
		const ids = Array.from({ length: 500 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
		ctx.store.seed(
			'personnel',
			ids.map((id) => ({
				id,
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Synthetic',
				last_name: 'Person',
				group_id: 'alpha',
				mos: '68W',
				clinic_role: 'Medic',
				archived_at: null
			}))
		);
		const references = ctx.personnel.listArchiveCandidates;
		ctx.personnel.listArchiveCandidates = async (requestedIds) => {
			if (requestedIds.length > 200) throw new Error('414 URI Too Long');
			return references(requestedIds);
		};
		const result = await importPersonnelRecords(ctx, {
			records: ids.map((personnelId) => ({
				op: 'update',
				personnelId,
				changes: { mos: '68V' }
			}))
		});
		expect(result).toMatchObject({ created: [], errors: [] });
		expect(result.updated).toHaveLength(500);
		expect(result.updated[499]).toMatchObject({ id: '00000000-0000-4000-8000-000000000499', mos: '68V' });
		await expect(ctx.personnel.findById('00000000-0000-4000-8000-000000000499')).resolves.toMatchObject({ mos: '68V' });
	});

	it('accepts 500 records and returns all saved rows', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: Array.from({ length: 500 }, (_, index) => ({
				op: 'create',
				rank: 'SGT',
				firstName: 'Synthetic',
				lastName: `Person${index}`
			}))
		});
		expect(result.created).toHaveLength(500);
		expect(result).toMatchObject({ updated: [], errors: [] });
		expect(result.created[499]).toMatchObject({
			rank: 'SGT',
			firstName: 'Synthetic',
			lastName: 'Person499',
			slug: 'person499-synthetic'
		});
		await expect(ctx.personnel.findBySlug('person499-synthetic')).resolves.toMatchObject({
			firstName: 'Synthetic',
			lastName: 'Person499'
		});
	});

	it.each([null, 'named'])(
		'recovers a %s hidden slug clash while reserving duplicate-name planned URLs',
		async (detail) => {
			const ctx = context();
			ctx.personnel.listImportSlugs = async () => [];
			const insert = ctx.personnel.createMany;
			ctx.personnel.createMany = async (rows) => {
				if (rows.some(({ slug }) => slug === 'smith-jamie'))
					throw Object.assign(new Error('duplicate key value violates unique constraint "personnel_org_slug_key"'), {
						code: '23505',
						details: detail === null ? null : 'Key (organization_id, slug)=(test-org, smith-jamie) already exists.'
					});
				return insert(rows);
			};
			const result = await importPersonnelRecords(ctx, {
				records: [
					{ op: 'create', rank: 'SGT', firstName: 'Jamie', lastName: 'Smith' },
					{ op: 'create', rank: 'SGT', firstName: 'Jamie', lastName: 'Smith' },
					{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' }
				]
			});
			expect(result).toMatchObject({
				created: [{ slug: 'smith-jamie-3' }, { slug: 'smith-jamie-2' }, { slug: 'person-new' }],
				updated: [],
				errors: []
			});
			await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({
				slug: 'smith-jamie',
				firstName: 'Jamie',
				lastName: 'Smith'
			});
			await expect(ctx.personnel.findBySlug('smith-jamie-3')).resolves.toMatchObject({
				firstName: 'Jamie',
				lastName: 'Smith'
			});
		}
	);

	it('creates and updates in one batch without deduplicating a deliberate same-name create', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'sgt', firstName: 'Jamie', lastName: 'Smith', groupId: 'alpha' },
				{ op: 'update', personnelId: 'person-a', changes: { rank: 'SSG', mos: '68V', clinicRole: 'Respiratory' } }
			]
		});
		expect(result).toMatchObject({
			created: [{ rank: 'SGT', firstName: 'Jamie', lastName: 'Smith', slug: 'smith-jamie-2', groupId: 'alpha' }],
			updated: [{ id: 'person-a', rank: 'SSG', mos: '68V', clinicRole: 'Respiratory' }],
			errors: []
		});
		expect(result.created[0].id).not.toBe('person-a');
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({
			rank: 'SSG',
			mos: '68V',
			clinicRole: 'Respiratory'
		});
		expect(ctx.audit.events).toEqual([
			{ action: 'personnel.bulk_merged', resourceType: 'personnel', details: { created: 1, updated: 1, errors: 0 } }
		]);
	});

	it('retains absent fields and permits explicit null dates and an unassigned Group', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } },
				{
					op: 'update',
					personnelId: 'person-b',
					changes: { groupId: null, ets: null, deros: '2028-02-29', clinicRole: '' }
				}
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [
				{
					id: 'person-a',
					rank: 'SGT',
					firstName: 'Jamie',
					lastName: 'Smith',
					slug: 'smith-jamie',
					mos: '68V',
					clinicRole: 'Medic',
					groupId: 'alpha',
					ets: '2028-05-01',
					deros: '2027-11-30'
				},
				{ id: 'person-b', groupId: null, ets: null, deros: '2028-02-29', clinicRole: 'Nurse' }
			],
			errors: []
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({
			clinicRole: 'Medic',
			ets: '2028-05-01',
			deros: '2027-11-30',
			groupId: 'alpha'
		});
		await expect(ctx.personnel.findById('person-b')).resolves.toMatchObject({
			groupId: null,
			ets: null,
			deros: '2028-02-29',
			clinicRole: 'Nurse'
		});
	});

	it.each(['', '   ', '\t\n'])('retains stored text when imported fields sanitize to blank: %j', async (blank) => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'update', personnelId: 'person-a', changes: { mos: blank, clinicRole: blank, ets: null, deros: null } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-a', mos: '68W', clinicRole: 'Medic', ets: null, deros: null }],
			errors: []
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({
			mos: '68W',
			clinicRole: 'Medic',
			ets: null,
			deros: null
		});
	});

	it('keeps the current retired rank without writing it when other fields change', async () => {
		const ctx = context();
		await ctx.personnel.updateEditable('person-a', { rank: 'SP4' });
		const update = ctx.personnel.updateEditable;
		ctx.personnel.updateEditable = async (id, patch, options) => {
			if (patch.rank !== undefined) throw new Error('A retired rank cannot be written');
			return update(id, patch, options);
		};
		const result = await importPersonnelRecords(ctx, {
			records: [{ op: 'update', personnelId: 'person-a', changes: { rank: ' sp4 ', mos: '68V' } }]
		});
		expect(result).toMatchObject({ created: [], updated: [{ id: 'person-a', rank: 'SP4', mos: '68V' }], errors: [] });
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ rank: 'SP4', mos: '68V' });
	});

	it('rejects later references to a Person even when the first row is invalid', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } },
				{ op: 'update', personnelId: 'person-b', changes: { rank: 'INVALID' } },
				{ op: 'update', personnelId: 'person-a', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'person-b', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'person-a', changes: { groupId: 'bravo' } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-a', mos: '68V', groupId: 'alpha' }],
			errors: [
				{ index: 1, message: expect.stringMatching(/Unknown rank/) },
				{ index: 2, message: expect.stringMatching(/already referenced/) },
				{ index: 3, message: expect.stringMatching(/already referenced/) },
				{ index: 4, message: expect.stringMatching(/already referenced/) }
			]
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68V', groupId: 'alpha' });
		await expect(ctx.personnel.findById('person-b')).resolves.toMatchObject({ mos: '68C', rank: 'SGT' });
	});

	it('bounds concurrent writes and preserves row positions when writes finish out of order or fail', async () => {
		vi.useFakeTimers();
		try {
			const ctx = context();
			ctx.store.seed(
				'personnel',
				Array.from({ length: 20 }, (_, index) => ({
					id: `person-${index}`,
					organization_id: 'test-org',
					rank: 'SGT',
					first_name: 'Synthetic',
					last_name: `Person${index}`,
					group_id: 'alpha',
					mos: '68W',
					archived_at: null
				}))
			);
			const update = ctx.personnel.updateEditable;
			let active = 0;
			let peak = 0;
			const completed: string[] = [];
			ctx.personnel.updateEditable = async (id, patch, options) => {
				active += 1;
				peak = Math.max(peak, active);
				try {
					await new Promise((resolve) => setTimeout(resolve, id === 'person-0' ? 30 : 1));
					if (id === 'person-1') throw new Error('Synthetic write failure');
					if (id === 'person-2') return null;
					return await update(id, patch, options);
				} finally {
					active -= 1;
					completed.push(id);
				}
			};
			const request = importPersonnelRecords(ctx, {
				records: Array.from({ length: 20 }, (_, index) => ({
					op: 'update',
					personnelId: `person-${index}`,
					changes: { mos: '68V' }
				}))
			});
			await vi.runAllTimersAsync();
			const result = await request;
			expect(peak).toBeGreaterThan(1);
			expect(peak).toBeLessThanOrEqual(16);
			expect(active).toBe(0);
			expect(completed[0]).toBe('person-1');
			expect(result).toMatchObject({
				created: [],
				errors: [
					{ index: 1, message: expect.stringMatching(/could not be confirmed/) },
					{ index: 2, message: expect.stringMatching(/active personnel/) }
				]
			});
			expect(result.updated.map(({ id }) => id)).toEqual([
				'person-0',
				'person-3',
				'person-4',
				'person-5',
				'person-6',
				'person-7',
				'person-8',
				'person-9',
				'person-10',
				'person-11',
				'person-12',
				'person-13',
				'person-14',
				'person-15',
				'person-16',
				'person-17',
				'person-18',
				'person-19'
			]);
			await expect(ctx.personnel.findById('person-0')).resolves.toMatchObject({ mos: '68V' });
			await expect(ctx.personnel.findById('person-19')).resolves.toMatchObject({ mos: '68V' });
			await expect(ctx.personnel.findById('person-1')).resolves.toMatchObject({ mos: '68W' });
		} finally {
			vi.useRealTimers();
		}
	});

	it('denies out-of-scope creates, current people and moves per row while saving allowed rows', async () => {
		const ctx = context({ auth: { scopeSet: { kind: 'groups', groupIds: ['alpha'] } } });
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Outside', groupId: 'bravo' },
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Unassigned', groupId: null },
				{ op: 'update', personnelId: 'person-b', changes: { groupId: 'alpha' } },
				{ op: 'update', personnelId: 'person-a', changes: { groupId: 'bravo' } },
				{ op: 'update', personnelId: 'person-c', changes: { groupId: null } },
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Allowed', groupId: 'alpha' },
				{ op: 'update', personnelId: 'person-d', changes: { mos: '68V' } }
			]
		});
		expect(result).toMatchObject({
			created: [{ lastName: 'Allowed', groupId: 'alpha' }],
			updated: [{ id: 'person-d', mos: '68V', groupId: 'alpha' }]
		});
		expect(result.errors.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4]);
		await expect(ctx.organizationPersonnel.findById('person-b')).resolves.toMatchObject({
			groupId: 'bravo',
			mos: '68C'
		});
		expect(ctx.audit.events).toEqual([
			{ action: 'personnel.bulk_merged', resourceType: 'personnel', details: { created: 1, updated: 1, errors: 5 } }
		]);
	});

	it('rejects missing, foreign and archived people without aborting a valid update', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'update', personnelId: 'missing', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'foreign-person', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'archived', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-a', mos: '68V' }],
			errors: [
				{ index: 0, message: expect.stringMatching(/scope/) },
				{ index: 1, message: expect.stringMatching(/scope/) },
				{ index: 2, message: expect.stringMatching(/scope/) }
			]
		});
		await expect(ctx.personnel.findById('archived')).resolves.toMatchObject({
			mos: '68V',
			archivedAt: '2026-10-01T00:00:00Z'
		});
	});

	it('rejects unknown Groups and Groups in another Organization', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'Test', lastName: 'Foreign', groupId: 'foreign' },
				{ op: 'update', personnelId: 'person-a', changes: { groupId: 'missing' } },
				{ op: 'update', personnelId: 'person-b', changes: { groupId: 'foreign' } }
			]
		});
		expect(result).toMatchObject({ created: [], updated: [], errors: [{ index: 0 }, { index: 1 }, { index: 2 }] });
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ groupId: 'alpha' });
	});

	it('rejects unknown ranks and retired ranks that differ from the current rank', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'INVALID', firstName: 'New', lastName: 'Invalid' },
				{ op: 'create', rank: 'SP4', firstName: 'New', lastName: 'Retired' },
				{ op: 'update', personnelId: 'person-a', changes: { rank: 'INVALID' } },
				{ op: 'update', personnelId: 'person-b', changes: { rank: 'sp4' } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [],
			errors: [
				{ index: 0, message: expect.stringMatching(/Unknown rank/) },
				{ index: 1, message: expect.stringMatching(/retired/) },
				{ index: 2, message: expect.stringMatching(/Unknown rank/) },
				{ index: 3, message: expect.stringMatching(/retired/) }
			]
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ rank: 'SGT' });
		await expect(ctx.personnel.findById('person-b')).resolves.toMatchObject({ rank: 'SGT' });
	});

	it('rejects impossible, empty and non-normalized dates per row', async () => {
		const ctx = context();
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'Invalid', lastName: 'Date', ets: '2027-02-29' },
				{ op: 'update', personnelId: 'person-b', changes: { ets: '' } },
				{ op: 'update', personnelId: 'person-a', changes: { deros: ' 2028-02-29 ' } },
				{ op: 'update', personnelId: 'person-c', changes: { ets: null } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-c', ets: null, deros: '2027-11-30' }],
			errors: [{ index: 0 }, { index: 1 }, { index: 2 }]
		});
		await expect(ctx.personnel.findById('person-c')).resolves.toMatchObject({ ets: null, deros: '2027-11-30' });
	});

	it('keeps independent rows after an unconfirmed update without retrying it', async () => {
		const ctx = context();
		const update = ctx.personnel.updateEditable;
		ctx.personnel.updateEditable = async (id, patch) => {
			const saved = await update(id, patch);
			if (id === 'person-a') throw new Error('Private provider diagnostics after commit');
			return saved;
		};
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } },
				{ op: 'update', personnelId: 'person-a', changes: { mos: 'BAD' } },
				{ op: 'update', personnelId: 'person-b', changes: { mos: '68P' } },
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' }
			]
		});
		expect(result).toMatchObject({
			created: [{ firstName: 'New', lastName: 'Person' }],
			updated: [{ id: 'person-b', mos: '68P' }],
			errors: [
				{ kind: 'unconfirmed', index: 0 },
				{ kind: 'failed', index: 1 }
			]
		});
		expect(JSON.stringify(result.errors)).not.toContain('Private provider');
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68V' });
	});

	it('awaits the one bulk audit before resolving the request', async () => {
		const ctx = context();
		await expect(
			importPersonnelRecords(
				{
					...ctx,
					audit: {
						log: async () => {
							throw new Error('Synthetic audit rejection');
						}
					}
				},
				{
					records: [{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } }]
				}
			)
		).rejects.toThrow('Synthetic audit rejection');
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68V' });
	});

	it('rejects 501 records before writing any rows', async () => {
		const ctx = context();
		await expect(
			importPersonnelRecords(ctx, {
				records: Array.from({ length: 501 }, () => ({ op: 'update', personnelId: 'person-a', changes: { mos: 'BAD' } }))
			})
		).rejects.toMatchObject({ status: 400 });
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68W' });
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([null, 'named'])(
		'recovers %s slug conflicts and preserves other rows when a candidate exhausts retries',
		async (detail) => {
			const ctx = context();
			ctx.personnel.listImportSlugs = async () => [];
			const insert = ctx.personnel.createMany;
			ctx.personnel.createMany = async (rows) => {
				const conflict = rows.find((row) => row.lastName === 'Smith');
				if (conflict)
					throw Object.assign(new Error('duplicate key value violates unique constraint "personnel_org_slug_key"'), {
						code: '23505',
						details: detail === null ? null : `Key (organization_id, slug)=(test-org, ${conflict.slug}) already exists.`
					});
				return insert(rows);
			};
			const result = await importPersonnelRecords(ctx, {
				records: [
					{ op: 'create', rank: 'SGT', firstName: 'Jamie', lastName: 'Smith' },
					{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' },
					{ op: 'update', personnelId: 'person-b', changes: { mos: '68P' } }
				]
			});
			expect(result).toMatchObject({
				created: [{ slug: 'person-new' }],
				updated: [{ id: 'person-b', mos: '68P' }],
				errors: [{ index: 0, message: expect.stringMatching(/not created/) }]
			});
			await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ slug: 'smith-jamie', mos: '68W' });
		}
	);

	it('does not retry an unconfirmed create response or lose successful updates', async () => {
		const ctx = context();
		const insert = ctx.personnel.createMany;
		ctx.personnel.createMany = async (rows) => {
			await insert(rows);
			throw new Error('Private provider diagnostics after commit');
		};
		const result = await importPersonnelRecords(ctx, {
			records: [
				{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' },
				{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } }
			]
		});
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-a', mos: '68V' }],
			errors: [{ kind: 'unconfirmed', index: 0 }]
		});
		expect(JSON.stringify(result.errors)).not.toContain('Private provider');
		await expect(ctx.store.findMany('personnel', 'test-org', { slug: 'person-new' })).resolves.toEqual([
			expect.objectContaining({ first_name: 'New', last_name: 'Person', slug: 'person-new' })
		]);
	});
});
