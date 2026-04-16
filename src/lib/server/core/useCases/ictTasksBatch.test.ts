import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { importIctTasksBatch } from './ictTasksBatch';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('importIctTasksBatch', () => {
	it('creates new tasks and updates existing tasks in upsert mode', async () => {
		const ctx = buildContext();
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-existing',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Old title',
				description: 'Old description',
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 5,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await importIctTasksBatch(ctx, {
			mode: 'upsert',
			records: [
				{
					rowNumber: 2,
					values: {
						taskCode: '181-105-1001',
						title: 'Updated title',
						mos: '18D',
						expirationMonths: '18'
					}
				},
				{
					rowNumber: 3,
					values: {
						taskCode: '181-105-1002',
						title: 'New task',
						mos: '68W, 18D',
						expirationMonths: '24',
						sortOrder: '8'
					}
				}
			]
		});

		expect(result.errors).toEqual([]);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'task-existing',
				taskCode: '181-105-1001',
				title: 'Updated title',
				mos: ['18D'],
				expirationMonths: 18,
				sortOrder: 5
			})
		]);
		expect(result.restored).toEqual([]);
		expect(result.inserted).toEqual([
			expect.objectContaining({
				taskCode: '181-105-1002',
				title: 'New task',
				mos: ['68W', '18D'],
				expirationMonths: 24,
				sortOrder: 8
			})
		]);

		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'ict_task.bulk_imported',
				resourceType: 'ict_task',
				details: {
					inserted: 1,
					updated: 1,
					restored: 0,
					errors: 0
				}
			})
		]);
	});

	it('restores archived tasks in upsert mode and reports them separately from updates', async () => {
		const ctx = buildContext();
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-archived',
				organization_id: 'test-org',
				task_code: '181-105-1999',
				title: 'Archived title',
				description: 'Archived description',
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 9,
				archived_at: '2026-04-10T00:00:00Z',
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await importIctTasksBatch(ctx, {
			mode: 'upsert',
			records: [
				{
					rowNumber: 2,
					values: {
						taskCode: '181-105-1999',
						title: 'Restored title',
						mos: '18D'
					}
				}
			]
		});

		expect(result.errors).toEqual([]);
		expect(result.inserted).toEqual([]);
		expect(result.updated).toEqual([]);
		expect(result.restored).toEqual([
			expect.objectContaining({
				id: 'task-archived',
				taskCode: '181-105-1999',
				title: 'Restored title',
				mos: ['18D'],
				archivedAt: null
			})
		]);

		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'ict_task.bulk_imported',
				resourceType: 'ict_task',
				details: {
					inserted: 0,
					updated: 0,
					restored: 1,
					errors: 0
				}
			})
		]);
	});
});
