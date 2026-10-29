import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import {
	clearDailyAssignmentSlot,
	replaceDailyAssignmentDay,
	setDailyAssignmentSlot
} from './dailyAssignmentOperations.server';

const TYPE_1 = '00000000-0000-4000-8000-000000000010';
const TYPE_2 = '00000000-0000-4000-8000-000000000011';
const TYPE_3 = '00000000-0000-4000-8000-000000000012';
const GROUP_TYPE = '00000000-0000-4000-8000-000000000013';
const OLD_TYPE = '00000000-0000-4000-8000-000000000014';
const GROUP_A = '00000000-0000-4000-8000-000000000015';
const GROUP_B = '00000000-0000-4000-8000-000000000016';
const GROUP_C = '00000000-0000-4000-8000-000000000017';
const PERSON_1 = '00000000-0000-4000-8000-000000000018';
const PERSON_2 = '00000000-0000-4000-8000-000000000019';
const PERSON_3 = '00000000-0000-4000-8000-00000000001a';
const PERSON_10 = '00000000-0000-4000-8000-00000000001b';
const PERSON_11 = '00000000-0000-4000-8000-00000000001c';
const PERSON_IN_GROUP = '00000000-0000-4000-8000-00000000001d';
const PERSON_OUTSIDE_GROUP = '00000000-0000-4000-8000-00000000001e';
const HIDDEN_PERSON = '00000000-0000-4000-8000-00000000001f';
const UNGROUPED_PERSON = '00000000-0000-4000-8000-000000000020';
const VISIBLE_PERSON = '00000000-0000-4000-8000-000000000021';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('replaceDailyAssignmentDay', () => {
	it('preserves surviving slot identity, removes omitted slots and creates new slots for the day', async () => {
		const ctx = buildContext();

		ctx.store.seed('daily_assignments', [
			{
				id: 'old-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_1,
				created_at: '2025-03-01T12:00:00.000Z'
			},
			{
				id: 'old-2',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_2,
				assignee_id: PERSON_2
			},
			{
				id: 'keep-1',
				organization_id: 'test-org',
				date: '2025-04-02',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_3
			}
		]);

		const result = await replaceDailyAssignmentDay(ctx, {
			date: '2025-04-01',
			records: [
				{ assignmentTypeId: TYPE_1, assigneeId: PERSON_10 },
				{ assignmentTypeId: TYPE_3, assigneeId: PERSON_11 }
			]
		});

		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'old-1',
					date: '2025-04-01',
					assignmentTypeId: TYPE_1,
					assigneeId: PERSON_10,
					created_at: '2025-03-01T12:00:00.000Z'
				}),
				expect.objectContaining({ date: '2025-04-01', assignmentTypeId: TYPE_3, assigneeId: PERSON_11 })
			])
		);

		const remaining = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(3);

		const ids = remaining.map((r) => r.id);
		expect(remaining).toContainEqual(
			expect.objectContaining({
				id: 'old-1',
				assignee_id: PERSON_10,
				created_at: '2025-03-01T12:00:00.000Z'
			})
		);
		expect(ids).not.toContain('old-2');

		expect(ids).toContain('keep-1');

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.replaced',
			resourceType: 'daily_assignment'
		});
	});

	it('enforces policy scope on all assignee IDs in the batch', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }),
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
		ctx.store.seed('personnel', [{ id: PERSON_OUTSIDE_GROUP, organization_id: 'test-org', group_id: GROUP_C }]);

		await expect(
			replaceDailyAssignmentDay(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: TYPE_1, assigneeId: PERSON_OUTSIDE_GROUP }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it.each([[HIDDEN_PERSON], [VISIBLE_PERSON, HIDDEN_PERSON], [UNGROUPED_PERSON]])(
		'rejects a replacement with unresolved or organization-scoped assignees: %j',
		async (...assigneeIds: string[]) => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }),
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
			// The caller's RLS-scoped provider cannot return hidden-person.
			ctx.store.seed('personnel', [
				{ id: VISIBLE_PERSON, organization_id: 'test-org', group_id: GROUP_A },
				{ id: UNGROUPED_PERSON, organization_id: 'test-org', group_id: null }
			]);
			const existing = {
				id: 'kept-slot',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: OLD_TYPE,
				assignee_id: VISIBLE_PERSON
			};
			ctx.store.seed('daily_assignments', [existing]);
			await expect(
				replaceDailyAssignmentDay(ctx, {
					date: '2025-04-01',
					records: assigneeIds.map((assigneeId, i) => ({ assignmentTypeId: `type-${i}`, assigneeId }))
				})
			).rejects.toMatchObject({ status: 403 });
			expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([existing]);
			expect(ctx.audit.events).toContainEqual(expect.objectContaining({ action: 'policy.denied' }));
		}
	);

	it('rejects replacing a day when an existing assignment is outside the policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }),
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
		ctx.store.seed('personnel', [
			{ id: PERSON_OUTSIDE_GROUP, organization_id: 'test-org', group_id: GROUP_C },
			{ id: PERSON_IN_GROUP, organization_id: 'test-org', group_id: GROUP_A }
		]);

		ctx.store.seed('daily_assignments', [
			{
				id: 'old-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_OUTSIDE_GROUP
			}
		]);

		await expect(
			replaceDailyAssignmentDay(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: TYPE_2, assigneeId: PERSON_IN_GROUP }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]?.id).toBe('old-1');
	});

	it('denies replacing existing assignments outside the shared multi-Group policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A, GROUP_B] })
			}
		});
		ctx.store.seed('personnel', [{ id: PERSON_OUTSIDE_GROUP, organization_id: 'test-org', group_id: GROUP_C }]);
		ctx.store.seed('daily_assignments', [
			{
				id: 'old-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_OUTSIDE_GROUP
			}
		]);

		await expect(
			replaceDailyAssignmentDay(ctx, {
				date: '2025-04-01',
				records: []
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]?.id).toBe('old-1');
	});
});

describe('setDailyAssignmentSlot', () => {
	const validInput = {
		date: '2025-04-01',
		assignmentTypeId: TYPE_1,
		assigneeId: PERSON_1
	};

	it('saves and audits a slot', async () => {
		const ctx = buildContext();

		const result = (await setDailyAssignmentSlot(ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			date: '2025-04-01',
			assignmentTypeId: TYPE_1,
			assigneeId: PERSON_1
		});

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({ action: 'daily_assignment.created', resourceType: 'daily_assignment' })
		);
	});

	it('enforces policy scope on assigneeId', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }),
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

		await expect(setDailyAssignmentSlot(ctx, validInput)).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('allows group assignees through Calendar group-scope policy', async () => {
		const ctx = buildContext({ auth: { scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }) } });

		ctx.store.seed('assignment_types', [
			{
				id: GROUP_TYPE,
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

		const result = (await setDailyAssignmentSlot(ctx, {
			date: '2025-04-01',
			assignmentTypeId: GROUP_TYPE,
			assigneeId: GROUP_A
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ assigneeId: GROUP_A, assignmentTypeId: GROUP_TYPE });
	});

	it('denies group assignees outside the shared multi-Group policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A, GROUP_B] })
			}
		});
		ctx.store.seed('assignment_types', [
			{
				id: GROUP_TYPE,
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

		await expect(
			setDailyAssignmentSlot(ctx, {
				date: '2025-04-01',
				assignmentTypeId: GROUP_TYPE,
				assigneeId: GROUP_C
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
	});
});

describe('setDailyAssignmentSlot with an occupied slot', () => {
	it('denies replacing an existing assignment outside the shared multi-Group policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A, GROUP_B] })
			}
		});
		ctx.store.seed('personnel', [
			{ id: PERSON_OUTSIDE_GROUP, organization_id: 'test-org', group_id: GROUP_C },
			{ id: PERSON_IN_GROUP, organization_id: 'test-org', group_id: GROUP_A }
		]);
		ctx.store.seed('daily_assignments', [
			{
				id: 'da-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_OUTSIDE_GROUP
			}
		]);

		await expect(
			setDailyAssignmentSlot(ctx, { date: '2025-04-01', assignmentTypeId: TYPE_1, assigneeId: PERSON_IN_GROUP })
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toEqual([
			expect.objectContaining({ id: 'da-1', date: '2025-04-01', assignee_id: PERSON_OUTSIDE_GROUP })
		]);
	});
});

describe('clearDailyAssignmentSlot', () => {
	it('rejects clearing an assignment slot when the existing assignee is outside the policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_A] }),
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
		ctx.store.seed('personnel', [{ id: PERSON_OUTSIDE_GROUP, organization_id: 'test-org', group_id: GROUP_C }]);

		ctx.store.seed('daily_assignments', [
			{
				id: 'da-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: TYPE_1,
				assignee_id: PERSON_OUTSIDE_GROUP
			}
		]);

		await expect(clearDailyAssignmentSlot(ctx, { date: '2025-04-01', assignmentTypeId: TYPE_1 })).rejects.toMatchObject(
			{
				status: 403,
				message: 'You do not have access to that Calendar scope'
			}
		);

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]?.id).toBe('da-1');
	});
});

describe('permission guards', () => {
	it('rejects when user lacks Calendar operate capability', async () => {
		const ctx = buildContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		await expect(
			setDailyAssignmentSlot(ctx, { date: '2025-04-01', assignmentTypeId: TYPE_1, assigneeId: PERSON_1 })
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires Calendar operation access'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.manageAssignments',
				reasonCode: 'denied:missing-capability'
			}
		});
	});
});
