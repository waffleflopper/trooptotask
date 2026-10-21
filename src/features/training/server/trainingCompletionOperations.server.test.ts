import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$features/training/server/trainingPersistence.test-support.server';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	updateTrainingRecord
} from './trainingCompletionOperations.server';

const PERSON_1 = '00000000-0000-4000-8000-00000000a001';
const PERSON_2 = '00000000-0000-4000-8000-00000000a002';
const PERSON_3 = '00000000-0000-4000-8000-00000000a003';
const PERSON_ARCHIVED = '00000000-0000-4000-8000-00000000a004';
const PERSON_FOREIGN = '00000000-0000-4000-8000-00000000a005';
const PERSON_MISSING = '00000000-0000-4000-8000-00000000a006';
const FOREIGN_PERSON = '00000000-0000-4000-8000-00000000a007';
const TRAINING_TYPE = '00000000-0000-4000-8000-00000000a008';
const FOREIGN_TRAINING_TYPE = '00000000-0000-4000-8000-00000000a009';
const RECORD = '00000000-0000-4000-8000-00000000a00a';
const DATE_ONLY_RECORD = '00000000-0000-4000-8000-00000000a00b';
const FOREIGN_RECORD = '00000000-0000-4000-8000-00000000a00c';
const MISSING_RECORD = '00000000-0000-4000-8000-00000000a00d';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function seedTrainingType(
	ctx: ReturnType<typeof buildContext>,
	overrides?: Partial<{
		id: string;
		expiration_months: number | null;
		expiration_date_only: boolean;
	}>
) {
	ctx.store.seed('training_types', [
		{
			id: overrides?.id ?? TRAINING_TYPE,
			organization_id: 'test-org',
			expiration_months: overrides?.expiration_months !== undefined ? overrides.expiration_months : 12,
			expiration_date_only: overrides?.expiration_date_only ?? false
		}
	]);
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

function seedRecord(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('personnel_trainings', [
		{
			id: RECORD,
			organization_id: 'test-org',
			personnel_id: PERSON_1,
			training_type_id: TRAINING_TYPE,
			completion_date: '2025-03-15',
			expiration_date: '2026-03-15',
			notes: null,
			certificate_url: null
		}
	]);
}

describe('createTrainingRecord', () => {
	const validInput = {
		personnelId: PERSON_1,
		trainingTypeId: TRAINING_TYPE,
		completionDate: '2025-03-15',
		notes: null,
		certificateUrl: null
	};

	it('looks up training type, calculates expiration, inserts, and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		const result = await createTrainingRecord(ctx, validInput);

		expect(result).toMatchObject({
			personnelId: PERSON_1,
			trainingTypeId: TRAINING_TYPE,
			completionDate: '2025-03-15',
			expirationDate: '2026-03-15'
		});

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'training_record.created',
			resourceType: 'training_record'
		});
	});

	it('uses client-provided expiration date for expirationDateOnly types', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_date_only: true, expiration_months: null });

		const result = await createTrainingRecord(ctx, {
			...validInput,
			completionDate: null,
			expirationDate: '2027-06-01'
		});

		expect(result).toMatchObject({
			expirationDate: '2027-06-01'
		});
	});

	it('sets null expiration when type has no expiration months', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: null });

		const result = await createTrainingRecord(ctx, validInput);
		expect(result.expirationDate).toBeNull();
	});

	it('upserts: updates existing record instead of creating duplicate', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		await createTrainingRecord(ctx, validInput);
		const result = await createTrainingRecord(ctx, {
			...validInput,
			completionDate: '2025-06-01'
		});

		expect(result).toMatchObject({
			completionDate: '2025-06-01',
			expirationDate: '2026-06-01'
		});

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events[1]).toMatchObject({
			action: 'training_record.updated'
		});
	});

	describe.each([
		{
			kind: 'dated',
			expirationDateOnly: false,
			dateInput: { completionDate: '2026-04-01' },
			clearedDateInput: { completionDate: null },
			dateFields: { completion_date: '2026-04-01', expiration_date: '2027-04-01' },
			clearedDateFields: { completion_date: null, expiration_date: null }
		},
		{
			kind: 'expiration-only',
			expirationDateOnly: true,
			dateInput: { expirationDate: '2026-04-01' },
			clearedDateInput: { expirationDate: null },
			dateFields: { expiration_date: '2026-04-01' },
			clearedDateFields: { expiration_date: null }
		}
	])(
		'repeated create for a $kind record',
		({ expirationDateOnly, dateInput, clearedDateInput, dateFields, clearedDateFields }) => {
			it.each([
				{ change: 'omitted fields', input: {}, fields: {} },
				{ change: 'notes only', input: { notes: 'New notes' }, fields: { notes: 'New notes' } },
				{ change: 'supplied date', input: dateInput, fields: dateFields },
				{
					change: 'explicit null clears',
					input: { ...clearedDateInput, notes: null, certificateUrl: null },
					fields: { ...clearedDateFields, notes: null, certificate_url: null }
				}
			])('preserves unsupplied saved values for $change', async ({ input, fields }) => {
				const ctx = buildContext();
				seedPersonnel(ctx);
				seedTrainingType(ctx, { expiration_date_only: expirationDateOnly });
				const before = {
					id: RECORD,
					organization_id: 'test-org',
					personnel_id: PERSON_1,
					training_type_id: TRAINING_TYPE,
					completion_date: '2025-03-15',
					expiration_date: '2026-03-15',
					notes: 'Saved notes',
					certificate_url: 'https://example.test/saved-certificate',
					created_at: '2025-03-15T12:00:00.000Z',
					updated_at: '2025-03-15T12:00:00.000Z'
				};
				ctx.store.seed('personnel_trainings', [structuredClone(before)]);

				const result = await createTrainingRecord(ctx, {
					personnelId: PERSON_1,
					trainingTypeId: TRAINING_TYPE,
					...input
				});
				const stored = await ctx.store.findMany<Pick<typeof before, 'updated_at'>>('personnel_trainings', 'test-org');
				const expected = { ...before, ...fields, updated_at: expect.any(String) };
				expect(stored, JSON.stringify({ before, stored, result })).toEqual([expected]);
				expect(result).toEqual({
					id: RECORD,
					organization_id: 'test-org',
					personnelId: PERSON_1,
					trainingTypeId: TRAINING_TYPE,
					completionDate: expected.completion_date,
					expirationDate: expected.expiration_date,
					notes: expected.notes,
					certificateUrl: expected.certificate_url,
					created_at: '2025-03-15T12:00:00.000Z',
					updated_at: stored[0].updated_at
				});
				expect(stored[0].updated_at).not.toBe(before.updated_at);
				expect(ctx.audit.events).toEqual([
					expect.objectContaining({
						action: 'training_record.updated',
						resourceType: 'training_record',
						resourceId: RECORD
					})
				]);
			});
		}
	);

	it.each([false, true])(
		'defaults omitted mutable fields to null on a fresh create with expiration-only %s',
		async (expirationDateOnly) => {
			const ctx = buildContext();
			seedPersonnel(ctx);
			seedTrainingType(ctx, { expiration_date_only: expirationDateOnly });
			const result = await createTrainingRecord(ctx, { personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE });
			expect(result).toMatchObject({
				personnelId: PERSON_1,
				trainingTypeId: TRAINING_TYPE,
				completionDate: null,
				expirationDate: null,
				notes: null,
				certificateUrl: null
			});
			expect(await ctx.store.findMany('personnel_trainings', 'test-org')).toEqual([
				expect.objectContaining({
					id: result.id,
					organization_id: 'test-org',
					personnel_id: PERSON_1,
					training_type_id: TRAINING_TYPE,
					completion_date: null,
					expiration_date: null,
					notes: null,
					certificate_url: null
				})
			]);
		}
	);

	it('enforces group scope on personnel', async () => {
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

		await expect(createTrainingRecord(ctx, { ...validInput, personnelId: PERSON_2 })).rejects.toMatchObject({
			status: 403
		});
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
	});

	it('allows record writes across the caller multi-Group scope set', async () => {
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

		await createTrainingRecord(ctx, validInput);
		await createTrainingRecord(ctx, { ...validInput, personnelId: PERSON_3 });

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(2);
	});

	it('uses all-status Training references for archived same-Group personnel when user Personnel SELECT is denied', async () => {
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
		const scopedFindOne = ctx.store.findOne.bind(ctx.store);
		ctx.store.findOne = ((table, orgId, filters, select) =>
			table === 'personnel'
				? Promise.reject(new Error('Personnel SELECT denied for this Training-only actor'))
				: scopedFindOne(table, orgId, filters, select)) as typeof ctx.store.findOne;

		const created = (await createTrainingRecord(ctx, { ...validInput, personnelId: PERSON_ARCHIVED })) as {
			id: string;
		};
		await expect(updateTrainingRecord(ctx, { id: created.id, notes: 'Updated' })).resolves.toMatchObject({
			notes: 'Updated'
		});
		await expect(deleteTrainingRecord(ctx, created.id)).resolves.toEqual({ requiresApproval: true });
	});

	it('rejects missing and foreign-Organization Personnel references before a record write', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		ctx.store.seed('personnel', [{ id: PERSON_FOREIGN, organization_id: 'other-org', group_id: null }]);

		for (const personnelId of [PERSON_MISSING, PERSON_FOREIGN]) {
			await expect(createTrainingRecord(ctx, { ...validInput, personnelId })).rejects.toMatchObject({ status: 404 });
		}
		await expect(ctx.store.findMany('personnel_trainings', 'test-org')).resolves.toEqual([]);
	});

	it('denies record writes when Training capability is view-only and audits the attempt', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_record',
				details: expect.objectContaining({
					policyAction: 'training.recordCompletions',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('errors when training type not found', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 404 });
	});
});

describe('updateTrainingRecord', () => {
	it('edits expiration-only dates and notes while preserving completion identity and null completion date', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_date_only: true, expiration_months: null });
		ctx.store.seed('personnel_trainings', [
			{
				id: DATE_ONLY_RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: null,
				expiration_date: '2026-10-14',
				notes: 'original',
				certificate_url: null
			}
		]);
		const result = await updateTrainingRecord(ctx, {
			id: DATE_ONLY_RECORD,
			expirationDate: '2026-10-15',
			notes: 'updated'
		});
		expect(result).toMatchObject({
			id: DATE_ONLY_RECORD,
			personnelId: PERSON_1,
			trainingTypeId: TRAINING_TYPE,
			completionDate: null,
			expirationDate: '2026-10-15',
			notes: 'updated'
		});
		await expect(
			ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: DATE_ONLY_RECORD })
		).resolves.toMatchObject({ completion_date: null, expiration_date: '2026-10-15', notes: 'updated' });
	});
	it('conceals missing and foreign records without writing or auditing an update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		ctx.store.seed('personnel_trainings', [
			{
				id: FOREIGN_RECORD,
				organization_id: 'other-org',
				personnel_id: FOREIGN_PERSON,
				training_type_id: FOREIGN_TRAINING_TYPE,
				completion_date: '2026-01-05',
				expiration_date: '2027-01-05',
				notes: 'Foreign notes',
				certificate_url: null
			}
		]);
		const before = await ctx.store.findMany('personnel_trainings', 'other-org');
		for (const id of [MISSING_RECORD, FOREIGN_RECORD]) {
			await expect(updateTrainingRecord(ctx, { id, notes: 'Forbidden change' })).rejects.toMatchObject({ status: 404 });
		}
		expect(await ctx.store.findMany('personnel_trainings', 'other-org')).toEqual(before);
		expect((await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', 'test-org'))[0].notes).toBeNull();
		expect(ctx.audit.events).toEqual([]);
	});

	it('updates an existing record through Training operate policy and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);

		const result = await updateTrainingRecord(ctx, {
			id: RECORD,
			completionDate: '2025-06-01',
			notes: 'Updated score'
		});

		expect(result).toMatchObject({
			id: RECORD,
			completionDate: '2025-06-01',
			expirationDate: '2026-06-01',
			notes: 'Updated score'
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'training_record.updated',
				resourceType: 'training_record',
				resourceId: RECORD
			})
		);
	});

	it('denies updates outside the caller scope set and audits the policy denial', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['group-b'] }
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);

		await expect(updateTrainingRecord(ctx, { id: RECORD, completionDate: '2025-06-01' })).rejects.toMatchObject({
			status: 403
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_record',
				resourceId: RECORD,
				details: expect.objectContaining({
					policyAction: 'training.recordCompletions',
					reasonCode: 'denied:out-of-scope'
				}),
				severity: 'warning'
			})
		);
	});
});

describe('completion write scope', () => {
	it('denies create, update and delete for an empty Group scope without changing the stored completion', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		await expect(
			createTrainingRecord(ctx, { personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-01' })
		).rejects.toMatchObject({ status: 403 });
		await expect(updateTrainingRecord(ctx, { id: RECORD, completionDate: '2026-04-01' })).rejects.toMatchObject({
			status: 403
		});
		await expect(deleteTrainingRecord(ctx, RECORD)).rejects.toMatchObject({ status: 403 });
		await expect(ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).resolves.toMatchObject([
			{ id: RECORD, completion_date: '2025-03-15', expiration_date: '2026-03-15', notes: null, certificate_url: null }
		]);
	});
});

describe('deleteTrainingRecord', () => {
	it('deletes record and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedRecord(ctx);

		await deleteTrainingRecord(ctx, RECORD);

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'training_record.deleted',
			resourceType: 'training_record',
			resourceId: RECORD
		});
	});

	it('enforces group scope via record lookup', async () => {
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
				scopeSet: { kind: 'groups', groupIds: ['group-b'] }
			}
		});
		seedPersonnel(ctx);
		seedRecord(ctx);

		await expect(deleteTrainingRecord(ctx, RECORD)).rejects.toMatchObject({ status: 403 });
	});

	it('returns requiresApproval when Training configure policy denies hard delete', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
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
		seedRecord(ctx);

		const result = await deleteTrainingRecord(ctx, RECORD);
		expect(result).toMatchObject({ requiresApproval: true });

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('allows hard delete with Training configure capability even when legacy full-editor is false', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		seedRecord(ctx);

		await deleteTrainingRecord(ctx, RECORD);

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);
	});
});

describe('direct patch boundary', () => {
	it('rejects malformed known fields with 400 without changing the record or auditing', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		await expect(
			updateTrainingRecord(ctx, {
				id: RECORD,
				notes: { retained: true },
				certificateUrl: ['legacy-value']
			})
		).rejects.toMatchObject({ status: 400 });
		await expect(ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).resolves.toMatchObject([
			{ id: RECORD, completion_date: '2025-03-15', expiration_date: '2026-03-15', notes: null, certificate_url: null }
		]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('strips unrelated keys while preserving omitted date/certificate', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		const result = await updateTrainingRecord(ctx, {
			id: RECORD,
			notes: 'Retained notes',
			personnelId: PERSON_2,
			organization_id: 'other-org',
			unrelated: 'discard'
		});
		expect(result).toMatchObject({
			id: RECORD,
			personnelId: PERSON_1,
			trainingTypeId: TRAINING_TYPE,
			completionDate: '2025-03-15',
			expirationDate: '2026-03-15',
			notes: 'Retained notes',
			certificateUrl: null,
			organization_id: 'test-org'
		});
		expect(result).not.toHaveProperty('unrelated');
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'training_record.updated',
			details: { personnel_id: PERSON_1, training_type_id: TRAINING_TYPE, completion_date: '2025-03-15' }
		});
	});
});
