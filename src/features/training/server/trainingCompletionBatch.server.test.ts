import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$features/training/server/trainingPersistence.test-support.server';
import { importTrainingRecords } from './trainingCompletionBatch.server';

const PERSON_1 = '00000000-0000-4000-8000-00000000b001';
const PERSON_2 = '00000000-0000-4000-8000-00000000b002';
const PERSON_3 = '00000000-0000-4000-8000-00000000b003';
const PERSON_ARCHIVED = '00000000-0000-4000-8000-00000000b004';
const PERSON_FOREIGN = '00000000-0000-4000-8000-00000000b005';
const PERSON_MISSING = '00000000-0000-4000-8000-00000000b006';
const PERSON_EXISTING = '00000000-0000-4000-8000-00000000b007';
const TRAINING_TYPE = '00000000-0000-4000-8000-00000000b008';
const EXEMPT_TYPE = '00000000-0000-4000-8000-00000000b009';
const UNKNOWN_TYPE = '00000000-0000-4000-8000-00000000b00a';
const EARLY_EXEMPT_TYPE = '00000000-0000-4000-8000-00000000b00b';
const LATE_EXEMPT_TYPE = '00000000-0000-4000-8000-00000000b00c';
const RECORD = '00000000-0000-4000-8000-00000000b00d';
const RETAINED_RECORD = '00000000-0000-4000-8000-00000000b00e';
const SAVED_COMPLETION = '00000000-0000-4000-8000-00000000b00f';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function seedTrainingType(
	ctx: ReturnType<typeof buildContext>,
	overrides?: Partial<{
		id: string;
		expiration_months: number | null;
		expiration_date_only: boolean;
		can_be_exempted: boolean;
		exempt_personnel_ids: string[];
	}>
) {
	const defaults = {
		id: TRAINING_TYPE,
		organization_id: 'test-org',
		name: 'Annual Rifle Qual',
		expiration_months: 12,
		expiration_date_only: false,
		can_be_exempted: false,
		exempt_personnel_ids: [],
		...overrides
	};
	ctx.store.seed('training_types', [defaults]);
	return defaults;
}

function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('personnel', [
		{
			id: PERSON_1,
			organization_id: 'test-org',
			rank: 'SGT',
			last_name: 'Alpha',
			first_name: 'Ann',
			mos: '11B',
			clinic_role: 'Rifleman',
			group_id: 'group-a',
			archived_at: null
		},
		{
			id: PERSON_2,
			organization_id: 'test-org',
			rank: 'SPC',
			last_name: 'Bravo',
			first_name: 'Ben',
			mos: '11B',
			clinic_role: 'Rifleman',
			group_id: 'group-b',
			archived_at: null
		},
		{
			id: PERSON_3,
			organization_id: 'test-org',
			rank: 'CPL',
			last_name: 'Charlie',
			first_name: 'Cam',
			mos: '11B',
			clinic_role: 'Rifleman',
			group_id: 'group-c',
			archived_at: null
		}
	]);
}

describe('importTrainingRecords', () => {
	it('inserts all valid records and logs audit event', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{
					personnelId: PERSON_2,
					trainingTypeId: TRAINING_TYPE,
					completionDate: '2025-06-15',
					status: 'completed',
					notes: 'Scored 38/40'
				}
			]
		});

		expect(result.inserted).toHaveLength(2);
		expect(result.updated).toHaveLength(0);
		expect(result.errors).toHaveLength(0);

		expect(result.inserted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE }),
				expect.objectContaining({ personnelId: PERSON_2, trainingTypeId: TRAINING_TYPE })
			])
		);

		// Audit logged
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'training.bulk_imported',
			resourceType: 'training_record',
			details: { inserted: 2, updated: 0, exempted: 0 }
		});
	});

	it('calculates expiration date from training type expiration_months', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: 6 });

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' }
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				completionDate: '2025-06-01',
				expirationDate: '2025-12-01'
			})
		);
	});

	it('uses completion date directly as expiration for date-only types', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: null, expiration_date_only: true });

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-01-15', status: 'completed' }
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				completionDate: '2026-01-15',
				expirationDate: '2026-01-15'
			})
		);
	});

	it('errors when expiration-date-only type has no completion date', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: null, expiration_date_only: true });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: null, status: 'completed' }]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ index: 0, message: 'Expiration date required for this training type' });
	});

	it('handles exempt records by updating training type exempt list', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { can_be_exempted: true, exempt_personnel_ids: [PERSON_EXISTING] });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: null, status: 'exempt' }]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.exempted).toHaveLength(1);
		expect(result.exempted[0]).toMatchObject({ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE });
		expect(result.errors).toHaveLength(0);

		// Training type should have both existing and new personnel in exempt list
		const types = await ctx.store.findMany<{ exempt_personnel_ids: string[] }>('training_types', 'test-org');
		expect(types[0].exempt_personnel_ids).toContain(PERSON_EXISTING);
		expect(types[0].exempt_personnel_ids).toContain(PERSON_1);
	});

	it('rejects missing and foreign-Organization exemption references without changing the type', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { can_be_exempted: true, exempt_personnel_ids: [PERSON_1] });
		ctx.store.seed('personnel', [{ id: PERSON_FOREIGN, organization_id: 'other-org', group_id: null }]);

		for (const personnelId of [PERSON_MISSING, PERSON_FOREIGN]) {
			await expect(
				importTrainingRecords(ctx, {
					records: [{ personnelId, trainingTypeId: TRAINING_TYPE, completionDate: null, status: 'exempt' }]
				})
			).rejects.toMatchObject({ status: 404 });
		}
		const type = await ctx.store.findOne<{ exempt_personnel_ids: string[] }>('training_types', 'test-org', {
			id: TRAINING_TYPE
		});
		expect(type?.exempt_personnel_ids).toEqual([PERSON_1]);
	});

	it('rejects exempt status when training type does not allow exemptions', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { can_be_exempted: false });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: null, status: 'exempt' }]
		});

		expect(result.exempted).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ index: 0, message: 'This training type does not allow exemptions' });
	});

	it('updates existing records and inserts new ones in same batch', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: 12 });

		// Seed an existing training record
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: 'test-org',
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: 'old notes'
			}
		]);
		const upsertManySpy = vi.spyOn(ctx.store, 'upsertMany');
		const updateSpy = vi.spyOn(ctx.store, 'update');

		const result = await importTrainingRecords(ctx, {
			records: [
				// Should UPDATE existing p-1 + tt-1
				{
					personnelId: PERSON_1,
					trainingTypeId: TRAINING_TYPE,
					completionDate: '2025-06-01',
					status: 'completed',
					notes: 'new notes'
				},
				// Should INSERT new p-2 + tt-1
				{ personnelId: PERSON_2, trainingTypeId: TRAINING_TYPE, completionDate: '2025-07-01', status: 'completed' }
			]
		});

		expect(upsertManySpy).toHaveBeenCalledTimes(1);
		expect(updateSpy).not.toHaveBeenCalled();
		expect(upsertManySpy.mock.calls[0][2]).toEqual([
			expect.objectContaining({
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-06-01',
				expiration_date: '2026-06-01',
				notes: 'new notes'
			}),
			expect.objectContaining({
				personnel_id: PERSON_2,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-07-01',
				expiration_date: '2026-07-01',
				notes: null
			})
		]);
		expect(upsertManySpy.mock.calls[0][3]).toEqual({
			onConflict: 'organization_id,personnel_id,training_type_id'
		});

		expect(result.updated).toHaveLength(1);
		expect(result.updated[0]).toEqual(
			expect.objectContaining({
				personnelId: PERSON_1,
				completionDate: '2025-06-01',
				expirationDate: '2026-06-01',
				notes: 'new notes'
			})
		);

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				personnelId: PERSON_2,
				completionDate: '2025-07-01'
			})
		);

		expect(result.errors).toHaveLength(0);

		// Audit reflects both counts
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			details: { inserted: 1, updated: 1 }
		});
	});

	it('deduplicates repeated completed records before the bulk upsert', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: 12 });
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: 'test-org',
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: 'old notes'
			}
		]);
		const upsertManySpy = vi.spyOn(ctx.store, 'upsertMany');

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{
					personnelId: PERSON_1,
					trainingTypeId: TRAINING_TYPE,
					completionDate: '2025-07-01',
					status: 'completed',
					notes: 'latest row wins'
				}
			]
		});

		expect(upsertManySpy).toHaveBeenCalledTimes(1);
		expect(upsertManySpy.mock.calls[0][2]).toEqual([
			expect.objectContaining({
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-07-01',
				expiration_date: '2026-07-01',
				notes: 'latest row wins'
			})
		]);
		expect(result.updated).toHaveLength(1);
		expect(result.inserted).toHaveLength(0);
		expect(result.updated[0]).toEqual(
			expect.objectContaining({
				personnelId: PERSON_1,
				completionDate: '2025-07-01',
				notes: 'latest row wins'
			})
		);
		expect(result.errors).toHaveLength(0);
	});

	it('excludes error and exempt rows from completed-record upsert payload', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { id: TRAINING_TYPE });
		seedTrainingType(ctx, {
			id: EXEMPT_TYPE,
			can_be_exempted: true,
			expiration_months: null,
			expiration_date_only: false
		});
		const upsertManySpy = vi.spyOn(ctx.store, 'upsertMany');

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{ personnelId: PERSON_2, trainingTypeId: UNKNOWN_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{ personnelId: PERSON_3, trainingTypeId: EXEMPT_TYPE, completionDate: null, status: 'exempt' }
			]
		});

		expect(upsertManySpy).toHaveBeenCalledTimes(1);
		expect(upsertManySpy.mock.calls[0][2]).toEqual([
			expect.objectContaining({
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE
			})
		]);
		expect(result.inserted).toHaveLength(1);
		expect(result.updated).toHaveLength(0);
		expect(result.exempted).toEqual([{ index: 2, personnelId: PERSON_3, trainingTypeId: EXEMPT_TYPE }]);
		expect(result.errors).toEqual([{ index: 1, message: 'Training type not found' }]);

		const exemptType = await ctx.store.findOne<{ exempt_personnel_ids: string[] }>('training_types', 'test-org', {
			id: EXEMPT_TYPE
		});
		expect(exemptType?.exempt_personnel_ids).toContain(PERSON_3);
	});

	it('preauthorizes every batch target before updating an allowed row', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		const existing = {
			id: SAVED_COMPLETION,
			organization_id: 'test-org',
			personnel_id: PERSON_1,
			training_type_id: TRAINING_TYPE,
			completion_date: '2024-06-01',
			expiration_date: '2025-06-01',
			notes: 'Retained'
		};
		ctx.store.seed('personnel_trainings', [existing]);

		await expect(
			importTrainingRecords(ctx, {
				records: [
					{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
					{ personnelId: PERSON_2, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' }
				]
			})
		).rejects.toMatchObject({ status: 403 });

		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_record',
				details: expect.objectContaining({
					policyAction: 'training.recordCompletions',
					reasonCode: 'denied:out-of-scope'
				}),
				severity: 'warning'
			})
		);

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toEqual([existing]);
	});

	it('allows batch record writes across the caller multi-Group scope set', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-c'] }
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{ personnelId: PERSON_3, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-02', status: 'completed' }
			]
		});

		expect(result.inserted).toHaveLength(2);
	});

	it('imports archived same-Group Training references when user Personnel SELECT is denied', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		ctx.store.seed('personnel', [
			{
				id: PERSON_ARCHIVED,
				organization_id: 'test-org',
				group_id: 'group-a',
				archived_at: '2026-01-01',
				last_name: 'Archived',
				first_name: 'Ann'
			}
		]);
		seedTrainingType(ctx);
		const scopedFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = ((table, orgId, filters, options) =>
			table === 'personnel'
				? Promise.reject(new Error('Personnel SELECT denied for this Training-only actor'))
				: scopedFindMany(table, orgId, filters, options)) as typeof ctx.store.findMany;

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{
					personnelId: PERSON_ARCHIVED,
					trainingTypeId: TRAINING_TYPE,
					completionDate: '2025-06-02',
					status: 'completed'
				}
			]
		});
		expect(result.inserted).toHaveLength(2);
	});

	it('requires configure capability before changing per-type exemption applicability', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx, { can_be_exempted: true });

		await expect(
			importTrainingRecords(ctx, {
				records: [
					{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
					{ personnelId: PERSON_2, trainingTypeId: TRAINING_TYPE, completionDate: null, status: 'exempt' }
				]
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('personnel_trainings', 'test-org')).toEqual([]);
		expect(await ctx.store.findOne('training_types', 'test-org', { id: TRAINING_TYPE })).toMatchObject({
			exempt_personnel_ids: []
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_type',
				details: expect.objectContaining({
					policyAction: 'training.configureRequirements',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('rejects empty records array', async () => {
		const ctx = buildContext();

		await expect(importTrainingRecords(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('collects per-record error for unknown training type while succeeding on valid records', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx); // tt-1 exists

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2025-06-01', status: 'completed' },
				{ personnelId: PERSON_2, trainingTypeId: UNKNOWN_TYPE, completionDate: '2025-06-01', status: 'completed' }
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(expect.objectContaining({ personnelId: PERSON_1 }));
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toEqual({ index: 1, message: 'Training type not found' });
	});

	it('rejects when records exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => ({
			personnelId: `p-${i}`,
			trainingTypeId: TRAINING_TYPE,
			completionDate: '2025-06-01',
			status: 'completed' as const
		}));

		await expect(importTrainingRecords(ctx, { records: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});
});

describe('batch acknowledged effects', () => {
	it('retains completion identity and certificate, then retains early effects when a later exemption fails without final audit', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedTrainingType(ctx, { id: EARLY_EXEMPT_TYPE, can_be_exempted: true, expiration_months: null });
		seedTrainingType(ctx, { id: LATE_EXEMPT_TYPE, can_be_exempted: true, expiration_months: null });
		ctx.store.seed('personnel_trainings', [
			{
				id: RETAINED_RECORD,
				organization_id: 'test-org',
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				certificate_url: 'keep-certificate',
				notes: 'old'
			}
		]);
		const patch = ctx.trainingCatalog.patchType;
		ctx.trainingCatalog.patchType = async (id, fields) => {
			if (id === LATE_EXEMPT_TYPE) throw new Error('Late exemption failed');
			return patch(id, fields);
		};
		await expect(
			importTrainingRecords(ctx, {
				records: [
					{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-03-01', status: 'completed' },
					{ personnelId: PERSON_2, trainingTypeId: EARLY_EXEMPT_TYPE, completionDate: null, status: 'exempt' },
					{ personnelId: PERSON_3, trainingTypeId: LATE_EXEMPT_TYPE, completionDate: null, status: 'exempt' }
				]
			})
		).rejects.toThrow('Late exemption failed');
		expect(await ctx.trainingCompletions.listCompletions()).toMatchObject([
			{
				id: RETAINED_RECORD,
				certificateUrl: 'keep-certificate',
				completionDate: '2026-03-01',
				expirationDate: '2027-03-01',
				notes: null
			}
		]);
		expect(await ctx.trainingCatalog.listTypeImportReferences([EARLY_EXEMPT_TYPE, LATE_EXEMPT_TYPE])).toMatchObject([
			{ id: EARLY_EXEMPT_TYPE, exemptPersonnelIds: [PERSON_2] },
			{ id: LATE_EXEMPT_TYPE, exemptPersonnelIds: [] }
		]);
		expect(ctx.audit.events).toEqual([]);
	});
	it('keeps an omitted never-expiring batch completion date omitted at the port boundary', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: null });
		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, status: 'completed' }] as Parameters<
				typeof importTrainingRecords
			>[1]['records']
		});
		expect(result.inserted).toMatchObject([
			{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, expirationDate: null, notes: null }
		]);
		expect(Object.hasOwn(result.inserted[0], 'completionDate')).toBe(false);
	});
});
