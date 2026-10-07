import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import {
	clearDailyAssignmentSlot,
	replaceDailyAssignmentDay,
	replaceDailyAssignmentSlotsBatch,
	setDailyAssignmentSlot
} from './dailyAssignmentOperations.server';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('Daily Assignment Slot writes', () => {
	it('rejects malformed slot input with 400 before any saved change or audit', async () => {
		const ctx = buildContext();
		const original = {
			id: 'retained-slot',
			organization_id: ctx.auth.orgId,
			date: '2026-03-22',
			assignment_type_id: 'type-a',
			assignee_id: 'original-person'
		};
		ctx.store.seed('daily_assignments', [original]);
		await expect(
			setDailyAssignmentSlot(ctx, {
				date: '2026-03-22',
				assignmentTypeId: 'type-a',
				assigneeId: 17
			})
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('daily_assignments', ctx.auth.orgId)).toEqual([original]);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each(['set', 'day', 'batch'] as const)(
		'%s saves a manual assignment with retired Duty storage unavailable',
		async (operation) => {
			const ctx = buildContext();
			const record = { date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' };
			const findMany = ctx.store.findMany.bind(ctx.store);
			const retiredReads: string[] = [];
			const unavailable = vi.spyOn(ctx.store, 'findMany').mockImplementation((table, ...args) => {
				if (table.startsWith('duty_') || table.startsWith('advanced_duty_')) {
					retiredReads.push(table);
					throw new Error('Retired Duty storage is unavailable');
				}
				return findMany(table, ...args);
			});
			try {
				switch (operation) {
					case 'set':
						await setDailyAssignmentSlot(ctx, record);
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
				expect(retiredReads).toEqual([]);
			} finally {
				unavailable.mockRestore();
			}
		}
	);

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
		'preserves the existing slot assignment when atomic replacement fails (status %s)',
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
			const replacementSpy = vi.spyOn(ctx.calendarAssignmentReplacement, 'replace').mockRejectedValueOnce(failure);

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
				replacementSpy.mockRestore();
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
		'preserves the existing day assignments when atomic replacement fails (status %s)',
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
			const replacementSpy = vi.spyOn(ctx.calendarAssignmentReplacement, 'replace').mockRejectedValueOnce(failure);

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
				replacementSpy.mockRestore();
			}
		}
	);

	it.each([undefined, 409])(
		'preserves affected batch slots when atomic replacement fails (status %s)',
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
			const replacementSpy = vi.spyOn(ctx.calendarAssignmentReplacement, 'replace').mockRejectedValueOnce(failure);

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
				replacementSpy.mockRestore();
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
