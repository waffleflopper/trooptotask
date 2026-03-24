import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createDailyAssignment, deleteDailyAssignment, replaceDailyAssignments } from './dailyAssignments';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auditPort = createTestAuditPort();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly ?? false),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort()
	};
}

describe('replaceDailyAssignments', () => {
	it('deletes existing assignments for the date and inserts new batch', async () => {
		const ctx = buildContext();

		// Seed existing assignments for the target date
		ctx.store.seed('daily_assignments', [
			{ id: 'old-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-1' },
			{ id: 'old-2', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-2', assignee_id: 'p-2' },
			// Different date — should NOT be deleted
			{ id: 'keep-1', organization_id: 'test-org', date: '2025-04-02', assignment_type_id: 'at-1', assignee_id: 'p-3' }
		]);

		const result = await replaceDailyAssignments(ctx, {
			date: '2025-04-01',
			records: [
				{ assignmentTypeId: 'at-1', assigneeId: 'p-10' },
				{ assignmentTypeId: 'at-3', assigneeId: 'p-11' }
			]
		});

		// New records returned
		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-10' }),
				expect.objectContaining({ date: '2025-04-01', assignmentTypeId: 'at-3', assigneeId: 'p-11' })
			])
		);

		// Old records for that date are gone, replaced by new ones
		const remaining = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(3); // 2 new + 1 kept from other date

		// The old IDs should not exist
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain('old-1');
		expect(ids).not.toContain('old-2');

		// The other date's record persists
		expect(ids).toContain('keep-1');

		// Audit logged
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'daily_assignment.replaced',
			resourceType: 'daily_assignment'
		});
	});

	it('enforces group scope on all assignee IDs in the batch', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch() {
					throw groupAccessError;
				}
			}
		});

		await expect(
			replaceDailyAssignments(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: 'at-1', assigneeId: 'p-outside-group' }]
			})
		).rejects.toMatchObject({ status: 403 });

		// Nothing should have been inserted
		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});
});

describe('createDailyAssignment', () => {
	const validInput = {
		date: '2025-04-01',
		assignmentTypeId: 'at-1',
		assigneeId: 'p-1'
	};

	it('validates, inserts, audits, and returns transformed result', async () => {
		const ctx = buildContext();

		const result = (await createDailyAssignment(ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			date: '2025-04-01',
			assignmentTypeId: 'at-1',
			assigneeId: 'p-1'
		});

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'daily_assignment.created',
			resourceType: 'daily_assignment'
		});
	});

	it('enforces group scope on assigneeId', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});

		await expect(createDailyAssignment(ctx, validInput)).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});
});

describe('deleteDailyAssignment', () => {
	function seedAssignment(ctx: TestContext) {
		ctx.store.seed('daily_assignments', [
			{ id: 'da-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-1' }
		]);
	}

	it('deletes record and audits', async () => {
		const ctx = buildContext();
		seedAssignment(ctx);

		await deleteDailyAssignment(ctx, 'da-1');

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'daily_assignment.deleted',
			resourceType: 'daily_assignment',
			resourceId: 'da-1'
		});
	});
});

describe('read-only and permission guards', () => {
	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(
			createDailyAssignment(ctx, { date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-1' })
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects replace when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(replaceDailyAssignments(ctx, { date: '2025-04-01', records: [] })).rejects.toMatchObject({
			status: 403
		});
	});

	it('rejects delete when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(deleteDailyAssignment(ctx, 'da-1')).rejects.toMatchObject({ status: 403 });
	});

	it('rejects when user lacks calendar edit permission', async () => {
		const ctx = buildContext({
			auth: {
				requireEdit() {
					throw new Error('No edit permission');
				}
			}
		});
		await expect(
			createDailyAssignment(ctx, { date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-1' })
		).rejects.toThrow('No edit permission');
	});
});
