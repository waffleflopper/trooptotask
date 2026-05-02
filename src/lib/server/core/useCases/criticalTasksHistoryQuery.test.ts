import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCriticalTasksPersonnelHistory } from './criticalTasksHistoryQuery';

describe('fetchCriticalTasksPersonnelHistory', () => {
	it('returns completion history with archived ICT task metadata intact', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Jane',
				last_name: 'Smith',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T12:00:00Z'
			},
			{
				id: 'task-archived',
				organization_id: 'test-org',
				task_code: '181-105-1002',
				title: 'Evacuate casualty',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T12:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				ict_task_id: 'task-active',
				completed_at: '2026-04-01',
				validation_method: 'Lecture',
				validated_by: 'SFC Jones',
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-04-01T12:00:00Z'
			},
			{
				id: 'completion-archived',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				ict_task_id: 'task-archived',
				completed_at: '2026-04-02',
				validation_method: 'Practical Exercise',
				validated_by: 'SFC Jones',
				notes: 'Lane validation',
				logged_by: 'user-1',
				created_at: '2026-04-02T12:00:00Z'
			}
		]);

		const result = await fetchCriticalTasksPersonnelHistory(ctx, 'p-1');

		expect(result.personnel.lastName).toBe('Smith');
		expect(result.rows.map((row) => row.completion.id)).toEqual(['completion-archived', 'completion-active']);
		expect(result.rows[0]).toMatchObject({
			taskCode: '181-105-1002',
			taskTitle: 'Evacuate casualty',
			taskArchivedAt: '2026-04-14T12:00:00Z'
		});
		expect(result.rows[1]).toMatchObject({
			taskCode: '181-105-1001',
			taskArchivedAt: null
		});
	});

	it('denies out-of-scope personnel history through scoped store reads', async () => {
		const ctx = createTestContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } } });
		ctx.store.seed('personnel', [
			{
				id: 'p-outside',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Bob',
				last_name: 'Bravo',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-b',
				archived_at: null
			}
		]);

		await expect(fetchCriticalTasksPersonnelHistory(ctx, 'p-outside')).rejects.toMatchObject({
			status: 404
		});
	});
});
