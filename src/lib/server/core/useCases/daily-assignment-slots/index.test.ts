import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	clearDailyAssignmentSlot,
	createDailyAssignmentSlot,
	updateDailyAssignmentSlot,
	replaceDailyAssignmentDay,
	replaceDailyAssignmentSlotsBatch,
	setDailyAssignmentSlot
} from '.';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('Daily Assignment Slot writes', () => {
	it.each(['create', 'set', 'update', 'day', 'batch'] as const)('%s saves a manual assignment', async (operation) => {
		const ctx = buildContext();
		const record = { date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' };
		if (operation === 'update') {
			ctx.store.seed('daily_assignments', [
				{
					id: 'saved-slot',
					organization_id: 'test-org',
					date: record.date,
					assignment_type_id: 'type-a',
					assignee_id: 'old-person'
				}
			]);
		}
		switch (operation) {
			case 'create':
				await createDailyAssignmentSlot(ctx, record);
				break;
			case 'set':
				await setDailyAssignmentSlot(ctx, record);
				break;
			case 'update':
				await updateDailyAssignmentSlot(ctx, { id: 'saved-slot', assigneeId: 'person-1' });
				break;
			case 'day':
				await replaceDailyAssignmentDay(ctx, { date: record.date, records: [record] });
				break;
			case 'batch':
				await replaceDailyAssignmentSlotsBatch(ctx, { records: [record] });
				break;
		}
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({ date: '2026-03-22', assignment_type_id: 'type-a', assignee_id: 'person-1' })
		]);
	});

	it('sets one slot through the Calendar-owned interface', async () => {
		const ctx = buildContext();

		const result = (await setDailyAssignmentSlot(ctx, {
			date: '2026-03-22',
			assignmentTypeId: 'type-a',
			assigneeId: 'person-1'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			date: '2026-03-22',
			assignmentTypeId: 'type-a',
			assigneeId: 'person-1'
		});
	});

	it.each([undefined, 409])(
		'preserves the existing slot assignment when replacement insert fails after clearing (status %s)',
		async (status) => {
			const failure = new Error('Calendar insert failed.');
			if (status) Object.assign(failure, { status });
			const ctx = buildContext();
			ctx.store.seed('daily_assignments', [
				{
					id: 'old-slot-a',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-a',
					assignee_id: 'old-person-a',
					created_at: '2026-03-21T14:15:16.000Z'
				},
				{
					id: 'same-day-other-type',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-b',
					assignee_id: 'other-type-person'
				},
				{
					id: 'same-type-other-day',
					organization_id: 'test-org',
					date: '2026-03-23',
					assignment_type_id: 'type-a',
					assignee_id: 'other-day-person'
				}
			]);
			const insertSpy = vi.spyOn(ctx.store, 'insert').mockRejectedValueOnce(failure);

			try {
				await expect(
					setDailyAssignmentSlot(ctx, {
						date: '2026-03-22',
						assignmentTypeId: 'type-a',
						assigneeId: 'person-1'
					})
				).rejects.toBe(failure);

				const stored = await ctx.store.findMany('daily_assignments', 'test-org');
				expect(stored).toHaveLength(3);
				expect(stored).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: 'old-slot-a',
							date: '2026-03-22',
							assignment_type_id: 'type-a',
							assignee_id: 'old-person-a',
							created_at: '2026-03-21T14:15:16.000Z'
						}),
						expect.objectContaining({
							id: 'same-day-other-type',
							date: '2026-03-22',
							assignment_type_id: 'type-b',
							assignee_id: 'other-type-person'
						}),
						expect.objectContaining({
							id: 'same-type-other-day',
							date: '2026-03-23',
							assignment_type_id: 'type-a',
							assignee_id: 'other-day-person'
						})
					])
				);
			} finally {
				insertSpy.mockRestore();
			}
		}
	);

	it('clears one slot through the Calendar-owned interface', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-slot',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			}
		]);

		await clearDailyAssignmentSlot(ctx, { date: '2026-03-22', assignmentTypeId: 'type-a' });

		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
	});

	it('replaces a day through the Calendar-owned interface', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'old-slot',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person'
			}
		]);

		const result = await replaceDailyAssignmentDay(ctx, {
			date: '2026-03-22',
			records: [{ assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
		});

		expect(result).toHaveLength(1);
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			})
		]);
	});

	it.each([undefined, 409])(
		'preserves the existing day assignments when replacement insert fails after clearing (status %s)',
		async (status) => {
			const failure = new Error('Calendar insert failed.');
			if (status) Object.assign(failure, { status });
			const ctx = buildContext();
			ctx.store.seed('daily_assignments', [
				{
					id: 'old-slot-a',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-a',
					assignee_id: 'old-person-a'
				},
				{
					id: 'other-day-slot',
					organization_id: 'test-org',
					date: '2026-03-23',
					assignment_type_id: 'type-a',
					assignee_id: 'other-day-person'
				}
			]);
			const insertManySpy = vi.spyOn(ctx.store, 'insertMany').mockRejectedValueOnce(failure);

			try {
				await expect(
					replaceDailyAssignmentDay(ctx, {
						date: '2026-03-22',
						records: [{ assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
					})
				).rejects.toBe(failure);

				const stored = await ctx.store.findMany('daily_assignments', 'test-org');
				expect(stored).toHaveLength(2);
				expect(stored).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: 'old-slot-a',
							date: '2026-03-22',
							assignment_type_id: 'type-a',
							assignee_id: 'old-person-a'
						}),
						expect.objectContaining({
							id: 'other-day-slot',
							date: '2026-03-23',
							assignment_type_id: 'type-a',
							assignee_id: 'other-day-person'
						})
					])
				);
			} finally {
				insertManySpy.mockRestore();
			}
		}
	);

	it.each([undefined, 409])(
		'preserves affected batch slots when replacement insert fails after clearing (status %s)',
		async (status) => {
			const failure = new Error('Calendar insert failed.');
			if (status) Object.assign(failure, { status });
			const ctx = buildContext();
			ctx.store.seed('daily_assignments', [
				{
					id: 'old-slot-a',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-a',
					assignee_id: 'old-person-a'
				},
				{
					id: 'old-slot-b',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-b',
					assignee_id: 'old-person-b'
				},
				{
					id: 'unaffected-same-day',
					organization_id: 'test-org',
					date: '2026-03-22',
					assignment_type_id: 'type-c',
					assignee_id: 'same-day-person'
				},
				{
					id: 'unaffected-same-type',
					organization_id: 'test-org',
					date: '2026-03-23',
					assignment_type_id: 'type-a',
					assignee_id: 'same-type-person'
				}
			]);
			const insertManySpy = vi.spyOn(ctx.store, 'insertMany').mockRejectedValueOnce(failure);

			try {
				await expect(
					replaceDailyAssignmentSlotsBatch(ctx, {
						records: [
							{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
							{ date: '2026-03-22', assignmentTypeId: 'type-b', assigneeId: '' }
						]
					})
				).rejects.toBe(failure);

				const stored = await ctx.store.findMany('daily_assignments', 'test-org');
				expect(stored).toHaveLength(4);
				expect(stored).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: 'old-slot-a',
							date: '2026-03-22',
							assignment_type_id: 'type-a',
							assignee_id: 'old-person-a'
						}),
						expect.objectContaining({
							id: 'old-slot-b',
							date: '2026-03-22',
							assignment_type_id: 'type-b',
							assignee_id: 'old-person-b'
						}),
						expect.objectContaining({
							id: 'unaffected-same-day',
							date: '2026-03-22',
							assignment_type_id: 'type-c',
							assignee_id: 'same-day-person'
						}),
						expect.objectContaining({
							id: 'unaffected-same-type',
							date: '2026-03-23',
							assignment_type_id: 'type-a',
							assignee_id: 'same-type-person'
						})
					])
				);
			} finally {
				insertManySpy.mockRestore();
			}
		}
	);

	it('requires manage assignment policy for clear-only empty batch slots', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const existing = {
			id: 'existing-slot',
			organization_id: 'test-org',
			date: '2026-03-22',
			assignment_type_id: 'type-a',
			assignee_id: 'person-1'
		};
		ctx.store.seed('daily_assignments', [existing]);

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '' }]
			})
		).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([existing]);
	});

	it('rejects duplicate batch slots before write side effects', async () => {
		const ctx = buildContext();

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-2' }
				]
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duplicate daily assignment slot in batch: 2026-03-22 / type-a'
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});
});
