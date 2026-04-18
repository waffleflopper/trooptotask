import { describe, expect, it } from 'vitest';
import { IctTaskEntity } from './ictTask';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import { entityHandlers, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';

describe('IctTaskEntity', () => {
	it('maps database rows to Critical Tasks task records', () => {
		const result = IctTaskEntity.fromDb({
			id: 'task-1',
			task_code: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: 'CLS task',
			category: 'Casualty Care',
			mos: ['68W', '18D'],
			expiration_months: 12,
			sort_order: 4,
			archived_at: null,
			created_at: '2026-04-01T12:00:00Z'
		}) as IctTask;

		expect(result).toEqual({
			id: 'task-1',
			taskCode: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: 'CLS task',
			category: 'Casualty Care',
			mos: ['68W', '18D'],
			expirationMonths: 12,
			sortOrder: 4,
			archivedAt: null,
			createdAt: '2026-04-01T12:00:00Z'
		});
	});

	it('normalizes null MOS arrays to an empty list', () => {
		const result = IctTaskEntity.fromDb({
			id: 'task-2',
			task_code: '181-105-1002',
			title: 'Document treatment',
			description: null,
			mos: null,
			expiration_months: null,
			sort_order: 0,
			archived_at: '2026-04-02T12:00:00Z',
			created_at: '2026-04-01T12:00:00Z'
		}) as IctTask;

		expect(result.description).toBeNull();
		expect(result.mos).toEqual([]);
		expect(result.expirationMonths).toBeNull();
		expect(result.sortOrder).toBe(0);
		expect(result.archivedAt).toBe('2026-04-02T12:00:00Z');
	});

	it('maps create input to database columns with organization scope and defaults', () => {
		const result = IctTaskEntity.toDbInsert(
			{
				taskCode: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: 'Aid under fire',
				category: 'Casualty Care',
				mos: ['68W'],
				sortOrder: 2
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			task_code: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: 'Aid under fire',
			category: 'Casualty Care',
			mos: ['68W'],
			expiration_months: null,
			sort_order: 2,
			archived_at: null
		});
	});

	it('defaults optional library metadata on create', () => {
		const result = IctTaskEntity.toDbInsert(
			{
				taskCode: '181-105-1001',
				title: 'Perform tactical combat casualty care'
			},
			'org-1'
		);

		expect(result).toMatchObject({
			description: null,
			category: null,
			mos: [],
			expiration_months: null,
			sort_order: 0,
			archived_at: null
		});
	});

	it('maps updates to database columns without id or read-only timestamps', () => {
		const result = IctTaskEntity.toDbUpdate({
			id: 'task-1',
			title: 'Updated task',
			description: 'Updated description',
			category: 'Casualty Care',
			expirationMonths: 24,
			sortOrder: 8,
			archivedAt: '2026-04-02T12:00:00Z',
			createdAt: '2026-04-01T12:00:00Z'
		});

		expect(result).toEqual({
			title: 'Updated task',
			description: 'Updated description',
			category: 'Casualty Care',
			expiration_months: 24,
			sort_order: 8,
			archived_at: '2026-04-02T12:00:00Z'
		});
	});

	it('uses an owner/admin-only task-library boundary', () => {
		expect(IctTaskEntity.table).toBe('ict_tasks');
		expect(IctTaskEntity.permission).toBe('training');
		expect(IctTaskEntity.requirePrivileged).toBe(true);
		expect(IctTaskEntity.requireFullEditor).toBeUndefined();
		expect(IctTaskEntity.methods).toEqual(['POST', 'PUT']);
		expect(IctTaskEntity.orderBy).toEqual([
			{ column: 'sort_order', ascending: true },
			{ column: 'task_code', ascending: true }
		]);
		expect(IctTaskEntity.audit).toEqual({
			resourceType: 'ict_task',
			detailFields: ['taskCode', 'title']
		});
	});

	it('audits task library create and soft-archive updates through the public entity handlers', async () => {
		const handlers = entityHandlers(IctTaskEntity);
		const ctx = createTestContext();

		const created = (await handleUseCaseRequest(handlers._configs.POST!, ctx, {
			taskCode: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: 'Aid under fire',
			category: 'Casualty Care',
			mos: ['68W'],
			expirationMonths: 12,
			sortOrder: 0
		})) as IctTask;

		expect(created.category).toBe('Casualty Care');

		await handleUseCaseRequest(handlers._configs.PUT!, ctx, {
			id: created.id,
			archivedAt: '2026-04-15T12:00:00Z'
		});

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'ict_task.created',
				resourceType: 'ict_task',
				resourceId: created.id
			}),
			expect.objectContaining({
				action: 'ict_task.updated',
				resourceType: 'ict_task',
				resourceId: created.id
			})
		]);
	});
});
