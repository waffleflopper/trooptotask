import { describe, expect, it } from 'vitest';
import { IctTaskEntity } from './ictTask';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

describe('IctTaskEntity', () => {
	it('maps database rows to Critical Tasks task records', () => {
		const result = IctTaskEntity.fromDb({
			id: 'task-1',
			task_code: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			mos: ['68W', '18D'],
			expiration_months: 12,
			archived_at: null,
			created_at: '2026-04-01T12:00:00Z'
		}) as IctTask;

		expect(result).toEqual({
			id: 'task-1',
			taskCode: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			mos: ['68W', '18D'],
			expirationMonths: 12,
			archivedAt: null,
			createdAt: '2026-04-01T12:00:00Z'
		});
	});

	it('normalizes null MOS arrays to an empty list', () => {
		const result = IctTaskEntity.fromDb({
			id: 'task-2',
			task_code: '181-105-1002',
			title: 'Document treatment',
			mos: null,
			expiration_months: null,
			archived_at: '2026-04-02T12:00:00Z',
			created_at: '2026-04-01T12:00:00Z'
		}) as IctTask;

		expect(result.mos).toEqual([]);
		expect(result.expirationMonths).toBeNull();
		expect(result.archivedAt).toBe('2026-04-02T12:00:00Z');
	});

	it('maps create input to database columns with organization scope and defaults', () => {
		const result = IctTaskEntity.toDbInsert(
			{
				taskCode: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				mos: ['68W']
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			task_code: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			mos: ['68W'],
			expiration_months: null,
			archived_at: null
		});
	});

	it('maps updates to database columns without id or read-only timestamps', () => {
		const result = IctTaskEntity.toDbUpdate({
			id: 'task-1',
			title: 'Updated task',
			expirationMonths: 24,
			archivedAt: '2026-04-02T12:00:00Z',
			createdAt: '2026-04-01T12:00:00Z'
		});

		expect(result).toEqual({
			title: 'Updated task',
			expiration_months: 24,
			archived_at: '2026-04-02T12:00:00Z'
		});
	});

	it('uses the existing training privileged configuration boundary', () => {
		expect(IctTaskEntity.table).toBe('ict_tasks');
		expect(IctTaskEntity.permission).toBe('training');
		expect(IctTaskEntity.requireFullEditor).toBe(true);
		expect(IctTaskEntity.methods).toEqual(['POST', 'PUT']);
		expect(IctTaskEntity.audit).toEqual({
			resourceType: 'ict_task',
			detailFields: ['taskCode', 'title']
		});
	});
});
