import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	calculateExpirationDate,
	createTrainingRecord,
	deleteTrainingRecord,
	updateTrainingRecord
} from './trainingRecords';

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

describe('calculateExpirationDate', () => {
	it('returns date offset by expiration months from completion date', () => {
		const result = calculateExpirationDate('2025-03-15', 12);
		expect(result).toBe('2026-03-15');
	});

	it('returns null when expiration months is null', () => {
		expect(calculateExpirationDate('2025-03-15', null)).toBeNull();
	});

	it('returns null when completion date is null', () => {
		expect(calculateExpirationDate(null, 12)).toBeNull();
	});

	it('clamps month-end overflow instead of rolling into the next month', () => {
		// BUG-FIX (issue #1148): was `date.setMonth(+n)` which overflowed
		// 2025-01-31 + 1 month → 2025-03-03. Now clamps to the last valid day,
		// matching the client preview in trainingStatus.ts.
		expect(calculateExpirationDate('2025-01-31', 1)).toBe('2025-02-28');
	});
});

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

		const result = (await createTrainingRecord(ctx, validInput)) as Record<string, unknown>;

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

		const result = (await createTrainingRecord(ctx, {
			...validInput,
			completionDate: null,
			expirationDate: '2027-06-01'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			expirationDate: '2027-06-01'
		});
	});

	it('sets null expiration when type has no expiration months', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx, { expiration_months: null });

		const result = (await createTrainingRecord(ctx, validInput)) as Record<string, unknown>;
		expect(result.expirationDate).toBeNull();
	});

	it('upserts: updates existing record instead of creating duplicate', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		await createTrainingRecord(ctx, validInput);
		const result = (await createTrainingRecord(ctx, {
			...validInput,
			completionDate: '2025-06-01'
		})) as Record<string, unknown>;

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

	it('rejects when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedPersonnel(ctx);
		seedTrainingType(ctx);

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 403 });
	});

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
	it('updates an existing record through Training operate policy and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		seedTrainingType(ctx);
		seedRecord(ctx);

		const result = (await updateTrainingRecord(ctx, {
			id: 'tr-1',
			completionDate: '2025-06-01',
			notes: 'Updated score'
		})) as Record<string, unknown>;

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

	it('blocks hard delete when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedPersonnel(ctx);
		seedRecord(ctx);

		await expect(deleteTrainingRecord(ctx, 'tr-1')).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);
	});
});
