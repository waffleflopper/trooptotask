import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort
} from '$lib/server/adapters/inMemory';
import { batchDailyAssignments } from './dailyAssignmentsBatch';

function buildContext(overrides?: { readOnly?: boolean; auth?: Parameters<typeof createTestAuthContext>[0] }) {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort()
	};
}

describe('batchDailyAssignments', () => {
	it('rejects empty records array', async () => {
		const ctx = buildContext();
		await expect(batchDailyAssignments(ctx, { records: [] })).rejects.toMatchObject({
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
		await expect(batchDailyAssignments(ctx, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 1000 records per batch'
		});
	});

	it('blocks when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('enforces group scope on assignee IDs', async () => {
		const ctx = buildContext({
			auth: {
				async requireGroupAccessBatch() {
					throw Object.assign(new Error('Group access denied'), { status: 403 });
				}
			}
		});
		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('logs an audit event', async () => {
		const ctx = buildContext();
		await batchDailyAssignments(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-03-22', assignmentTypeId: 'type-b', assigneeId: '' }
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

		// Seed an existing assignment that should be cleared
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person'
			}
		]);

		const result = await batchDailyAssignments(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-03-22', assignmentTypeId: 'type-b', assigneeId: '' } // clear slot
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.cleared).toBe(1);

		// Verify old assignment was cleared
		const remaining = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).assignee_id).toBe('person-1');
	});
});
