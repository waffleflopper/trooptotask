import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$features/training/server/trainingPersistence.test-support.server';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	updateTrainingRecord
} from './trainingCompletionOperations.server';

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
			id: overrides?.id ?? 'tt-1',
			organization_id: 'test-org',
			expiration_months: overrides?.expiration_months !== undefined ? overrides.expiration_months : 12,
			expiration_date_only: overrides?.expiration_date_only ?? false
		}
	]);
}

function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('personnel', [
		{
			id: 'p-1',
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
			id: 'p-2',
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
			id: 'p-3',
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
			id: 'tr-1',
			organization_id: 'test-org',
			personnel_id: 'p-1',
			training_type_id: 'tt-1',
			completion_date: '2025-03-15',
			expiration_date: '2026-03-15',
			notes: null,
			certificate_url: null
		}
	]);
}

describe('createTrainingRecord', () => {
	const validInput = {
		personnelId: 'p-1',
		trainingTypeId: 'tt-1',
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
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
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
					id: 'tr-1',
					organization_id: 'test-org',
					personnel_id: 'p-1',
					training_type_id: 'tt-1',
					completion_date: '2025-03-15',
					expiration_date: '2026-03-15',
					notes: 'Saved notes',
					certificate_url: 'https://example.test/saved-certificate',
					created_at: '2025-03-15T12:00:00.000Z',
					updated_at: '2025-03-15T12:00:00.000Z'
				};
				ctx.store.seed('personnel_trainings', [structuredClone(before)]);

				const result = await createTrainingRecord(ctx, { personnelId: 'p-1', trainingTypeId: 'tt-1', ...input });
				const stored = await ctx.store.findMany<Pick<typeof before, 'updated_at'>>('personnel_trainings', 'test-org');
				const expected = { ...before, ...fields, updated_at: expect.any(String) };
				expect(stored, JSON.stringify({ before, stored, result })).toEqual([expected]);
				expect(result).toEqual({
					id: 'tr-1',
					organization_id: 'test-org',
					personnelId: 'p-1',
					trainingTypeId: 'tt-1',
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
						resourceId: 'tr-1'
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
			const result = await createTrainingRecord(ctx, { personnelId: 'p-1', trainingTypeId: 'tt-1' });
			expect(result).toMatchObject({
				personnelId: 'p-1',
				trainingTypeId: 'tt-1',
				completionDate: null,
				expirationDate: null,
				notes: null,
				certificateUrl: null
			});
			expect(await ctx.store.findMany('personnel_trainings', 'test-org')).toEqual([
				expect.objectContaining({
					id: result.id,
					organization_id: 'test-org',
					personnel_id: 'p-1',
					training_type_id: 'tt-1',
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

		await expect(createTrainingRecord(ctx, { ...validInput, personnelId: 'p-2' })).rejects.toMatchObject({
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
		await createTrainingRecord(ctx, { ...validInput, personnelId: 'p-3' });

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
				id: 'p-archived',
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

		const created = (await createTrainingRecord(ctx, { ...validInput, personnelId: 'p-archived' })) as { id: string };
		await expect(updateTrainingRecord(ctx, { id: created.id, notes: 'Updated' })).resolves.toMatchObject({
			notes: 'Updated'
		});
		await expect(deleteTrainingRecord(ctx, created.id)).resolves.toEqual({ requiresApproval: true });
	});

	it('rejects missing and foreign-Organization Personnel references before a record write', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		ctx.store.seed('personnel', [{ id: 'p-foreign', organization_id: 'other-org', group_id: null }]);

		for (const personnelId of ['p-missing', 'p-foreign']) {
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
		// no training type seeded

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
				id: 'date-only-record',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: null,
				expiration_date: '2026-10-14',
				notes: 'original',
				certificate_url: null
			}
		]);
		const result = await updateTrainingRecord(ctx, {
			id: 'date-only-record',
			expirationDate: '2026-10-15',
			notes: 'updated'
		});
		expect(result).toMatchObject({
			id: 'date-only-record',
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: null,
			expirationDate: '2026-10-15',
			notes: 'updated'
		});
		await expect(
			ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: 'date-only-record' })
		).resolves.toMatchObject({ completion_date: null, expiration_date: '2026-10-15', notes: 'updated' });
	});
	it('conceals missing and foreign records without writing or auditing an update', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'foreign-record',
				organization_id: 'other-org',
				personnel_id: 'foreign-person',
				training_type_id: 'foreign-type',
				completion_date: '2026-01-05',
				expiration_date: '2027-01-05',
				notes: 'Foreign notes',
				certificate_url: null
			}
		]);
		const before = await ctx.store.findMany('personnel_trainings', 'other-org');
		for (const id of ['missing-record', 'foreign-record']) {
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
			id: 'tr-1',
			completionDate: '2025-06-01',
			notes: 'Updated score'
		});

		expect(result).toMatchObject({
			id: 'tr-1',
			completionDate: '2025-06-01',
			expirationDate: '2026-06-01',
			notes: 'Updated score'
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'training_record.updated',
				resourceType: 'training_record',
				resourceId: 'tr-1'
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

		await expect(updateTrainingRecord(ctx, { id: 'tr-1', completionDate: '2025-06-01' })).rejects.toMatchObject({
			status: 403
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_record',
				resourceId: 'tr-1',
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
			createTrainingRecord(ctx, { personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2026-04-01' })
		).rejects.toMatchObject({ status: 403 });
		await expect(updateTrainingRecord(ctx, { id: 'tr-1', completionDate: '2026-04-01' })).rejects.toMatchObject({
			status: 403
		});
		await expect(deleteTrainingRecord(ctx, 'tr-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).resolves.toMatchObject([
			{ id: 'tr-1', completion_date: '2025-03-15', expiration_date: '2026-03-15', notes: null, certificate_url: null }
		]);
	});
});

describe('deleteTrainingRecord', () => {
	it('deletes record and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedRecord(ctx);

		await deleteTrainingRecord(ctx, 'tr-1');

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'training_record.deleted',
			resourceType: 'training_record',
			resourceId: 'tr-1'
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

		await expect(deleteTrainingRecord(ctx, 'tr-1')).rejects.toMatchObject({ status: 403 });
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

		const result = await deleteTrainingRecord(ctx, 'tr-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Record should NOT be deleted
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

		await deleteTrainingRecord(ctx, 'tr-1');

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);
	});
});

describe('retained direct patch boundary', () => {
	it('forwards present malformed known fields while stripping unrelated keys and preserving omitted date/certificate', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);
		const result = await updateTrainingRecord(ctx, {
			id: 'tr-1',
			notes: { retained: true },
			certificateUrl: ['legacy-value'],
			personnelId: 'p-2',
			organization_id: 'other-org',
			unrelated: 'discard'
		});
		expect(result).toMatchObject({
			id: 'tr-1',
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: '2025-03-15',
			expirationDate: '2026-03-15',
			notes: { retained: true },
			certificateUrl: ['legacy-value'],
			organization_id: 'test-org'
		});
		expect(result).not.toHaveProperty('unrelated');
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'training_record.updated',
			details: { personnel_id: 'p-1', training_type_id: 'tt-1', completion_date: '2025-03-15' }
		});
	});
});
