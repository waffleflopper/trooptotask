import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/critical-tasks/matrix/export', () => {
	it('uses training read permission and returns a matrix CSV matching group and gap filters', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-jones',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-current',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'TCCC lane',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-gap',
				organization_id: ctx.auth.orgId,
				task_code: '081-833-0010',
				title: 'Open airway',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-smith',
				ict_task_id: 'task-current',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-jones',
				ict_task_id: 'task-current',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-3',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-jones',
				ict_task_id: 'task-gap',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			}
		]);

		expect(_getConfig.permission).toBe('training');

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			gapsOnly: true,
			search: undefined
		});
		const response = _getConfig.formatOutput?.(result);

		expect(result).toContain('Name,Rank,MOS,Role,Group,081-833-0010 Open airway');
		expect(result).toContain('"Smith, Jane",SGT,68W,Medic,Alpha,Not Recorded');
		expect(result).not.toContain('Jones, Alex');
		expect(result).not.toContain('181-105-1001 TCCC lane');
		expect(response?.headers.get('Content-Type')).toBe('text/csv;charset=utf-8');
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="critical-task-matrix-/);
	});
});
