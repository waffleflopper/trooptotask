import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import { replaceDailyAssignmentSlotsBatch } from './dailyAssignmentOperations.server';

const TYPE_A = '00000000-0000-4000-8000-000000000010';
const TYPE_B = '00000000-0000-4000-8000-000000000011';
const TYPE_GROUP = '00000000-0000-4000-8000-000000000012';
const PERSON_1 = '00000000-0000-4000-8000-000000000013';
const PERSON_2 = '00000000-0000-4000-8000-000000000014';
const PERSON_OUTSIDE = '00000000-0000-4000-8000-000000000015';
const OLD_PERSON = '00000000-0000-4000-8000-000000000016';
const OLD_PERSON_1 = '00000000-0000-4000-8000-000000000017';
const OLD_PERSON_2 = '00000000-0000-4000-8000-000000000018';
const GROUP_A = '00000000-0000-4000-8000-000000000019';
const GROUP_B = '00000000-0000-4000-8000-00000000001a';
const GROUP_C = '00000000-0000-4000-8000-00000000001b';
const GROUP_HQ = '00000000-0000-4000-8000-00000000001c';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('replaceDailyAssignmentSlotsBatch', () => {
	it('rejects empty records array', async () => {
		const ctx = buildContext();
		await expect(replaceDailyAssignmentSlotsBatch(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('rejects batches over 1000 records', async () => {
		const ctx = buildContext();
		const records = Array.from({ length: 1001 }, (_, i) => ({
			date: '2026-03-22',
			assignmentTypeId: `type-${i}`,
			assigneeId: `person-${i}`
		}));
		await expect(replaceDailyAssignmentSlotsBatch(ctx, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 1000 records per batch'
		});
	});

	it.each([
		['missing', { date: '2026-03-22', assignmentTypeId: TYPE_A }],
		['non-string', { date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: 123 }]
	])('rejects records with %s assigneeId before persistence and audit side effects', async (_label, record) => {
		const ctx = buildContext();
		ctx.store.findMany = vi.fn(ctx.store.findMany.bind(ctx.store)) as typeof ctx.store.findMany;
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [record as Parameters<typeof replaceDailyAssignmentSlotsBatch>[1]['records'][number]]
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Each record must include string date, assignmentTypeId, and assigneeId'
		});

		expect(ctx.store.findMany).not.toHaveBeenCalled();
		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects a date that is not a real calendar day before any port is called', async () => {
		const ctx = buildContext();
		ctx.store.findMany = vi.fn(ctx.store.findMany.bind(ctx.store)) as typeof ctx.store.findMany;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;
		const replace = vi.spyOn(ctx.calendarAssignmentReplacement, 'replace');

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-02-30', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 }]
			})
		).rejects.toMatchObject({ status: 400 });

		expect(ctx.store.findMany).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('enforces policy scope on assignee IDs', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP_A] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: 'test-org', group_id: GROUP_C }]);

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
	});

	it('denies clearing an affected slot when the existing assignee is outside policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP_A] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: PERSON_OUTSIDE, organization_id: 'test-org', group_id: GROUP_C }]);
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-outside',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: TYPE_A,
				assignee_id: PERSON_OUTSIDE
			}
		]);

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: '' }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const rawStore = ctx.rawStore;
		expect(rawStore).toBeDefined();
		if (!rawStore) throw new Error('Expected rawStore in scoped batch assignment test');
		const remaining = await rawStore.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.id).toBe('existing-outside');
	});

	it('authorizes group assignees through Calendar group scope', async () => {
		const ctx = buildContext({
			auth: { scopeSet: { kind: 'groups', groupIds: [GROUP_A] } }
		});

		ctx.store.seed('assignment_types', [
			{
				id: TYPE_GROUP,
				organization_id: 'test-org',
				name: 'Front Desk',
				short_name: 'FD',
				assign_to: 'group',
				color: '#123456',
				sort_order: 0,
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				show_on_calendar: false
			}
		]);

		const result = await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [{ date: '2026-03-22', assignmentTypeId: TYPE_GROUP, assigneeId: GROUP_A }]
		});

		expect(result.inserted).toHaveLength(1);
	});

	it('denies group assignees outside Calendar group scope before batch persistence', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP_A] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('assignment_types', [
			{
				id: TYPE_GROUP,
				organization_id: 'test-org',
				name: 'Front Desk',
				short_name: 'FD',
				assign_to: 'group',
				color: '#123456',
				sort_order: 0,
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				show_on_calendar: false
			}
		]);
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: TYPE_GROUP, assigneeId: GROUP_B }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
	});

	it('logs an audit event', async () => {
		const ctx = buildContext();
		await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 },
				{ date: '2026-03-22', assignmentTypeId: TYPE_B, assigneeId: '' }
			]
		});
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.batch_replaced',
			resourceType: 'daily_assignment',
			details: { totalSlots: 2, inserted: 1, cleared: 1 }
		});
	});

	it('clears affected slots and inserts upserts', async () => {
		const ctx = buildContext();

		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: TYPE_A,
				assignee_id: OLD_PERSON
			}
		]);

		const result = await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 },
				{ date: '2026-03-22', assignmentTypeId: TYPE_B, assigneeId: '' }
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.cleared).toBe(1);

		const remaining = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).assignee_id).toBe(PERSON_1);
	});

	it('treats whitespace assignees as clears before persistence and audit details', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: TYPE_A,
				assignee_id: OLD_PERSON
			}
		]);

		const result = await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: '   ' }]
		});

		expect(result).toEqual({ inserted: [], cleared: 1 });
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
		expect(ctx.audit.events[0]).toMatchObject({
			details: { totalSlots: 1, inserted: 0, cleared: 1 }
		});
	});

	it('rejects duplicate set records before policy, persistence, and audit side effects', async () => {
		const ctx = buildContext();
		ctx.store.findMany = vi.fn(ctx.store.findMany.bind(ctx.store)) as typeof ctx.store.findMany;
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [
					{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 },
					{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_2 }
				]
			})
		).rejects.toMatchObject({
			status: 400,
			message: `Duplicate daily assignment slot in batch: 2026-03-22 / ${TYPE_A}`
		});

		expect(ctx.store.findMany).not.toHaveBeenCalled();
		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects duplicate clear records and mixed set clear records with the same invalid-batch rule', async () => {
		for (const records of [
			[
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: '' },
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: ' ' }
			],
			[
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 },
				{ date: '2026-03-22', assignmentTypeId: TYPE_A, assigneeId: '' }
			]
		]) {
			const ctx = buildContext();

			await expect(replaceDailyAssignmentSlotsBatch(ctx, { records })).rejects.toMatchObject({
				status: 400,
				message: `Duplicate daily assignment slot in batch: 2026-03-22 / ${TYPE_A}`
			});
			expect(ctx.audit.events).toEqual([]);
		}
	});

	it('replaces affected assignment slots without disturbing unrelated dates', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: PERSON_1,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: GROUP_HQ,
				group_name: 'Headquarters'
			},
			{
				id: PERSON_2,
				organization_id: 'test-org',
				rank: 'SSG',
				last_name: 'Parker',
				first_name: 'Drew',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: GROUP_HQ,
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-04-10',
				assignment_type_id: TYPE_A,
				assignee_id: OLD_PERSON_1
			},
			{
				id: 'existing-2',
				organization_id: 'test-org',
				date: '2026-04-11',
				assignment_type_id: TYPE_A,
				assignee_id: OLD_PERSON_2
			}
		]);

		await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [
				{ date: '2026-04-10', assignmentTypeId: TYPE_A, assigneeId: PERSON_1 },
				{ date: '2026-04-11', assignmentTypeId: TYPE_A, assigneeId: PERSON_2 }
			]
		});

		const assignments = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(assignments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					date: '2026-04-10',
					assignment_type_id: TYPE_A,
					assignee_id: PERSON_1
				}),
				expect.objectContaining({
					date: '2026-04-11',
					assignment_type_id: TYPE_A,
					assignee_id: PERSON_2
				})
			])
		);
		expect(assignments).toHaveLength(2);
	});
});
