import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/critical-tasks/reports/export', () => {
	it('places the filtered at-risk Soldiers call list before summary rows', async () => {
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
				id: 'p-nora',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'NoUpdate',
				first_name: 'Nora',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-outside',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Outside',
				first_name: 'Olivia',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-common',
				organization_id: ctx.auth.orgId,
				task_code: '071-000-0001',
				title: 'Maintain communications',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});
		const lines = result.split('\n');

		expect(lines[0]).toBe('Section,Metric,Value,Subtitle');
		expect(lines[1]).toBe('At-Risk Soldiers,"NoUpdate, Nora",0%,SPC 11B; Alpha; 0 expiring <=60d; No ICT update');
		expect(lines[2]).toContain('Summary,Overall Readiness,0%');
		expect(result).not.toContain('Outside, Olivia');
		expect(result).not.toContain('Bravo');
	});

	it('uses training read permission and returns a report-context CSV download', async () => {
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
				id: 'task-medic',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'TCCC lane',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-common',
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
				ict_task_id: 'task-medic',
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
				personnel_id: 'p-smith',
				ict_task_id: 'task-common',
				completed_at: '2025-12-20',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2025-12-20T00:00:00Z'
			},
			{
				id: 'completion-3',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-jones',
				ict_task_id: 'task-common',
				completed_at: '2024-01-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2024-01-01T00:00:00Z'
			}
		]);

		expect(_getConfig.permission).toBe('training');

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});
		const response = _getConfig.formatOutput?.(result);

		expect(result).toContain('Section,Metric,Value,Subtitle');
		expect(result).toContain('Summary,Overall Readiness,100%');
		expect(result).toContain('Summary,Soldiers Below 70%,0,1 applicable Soldier');
		expect(result).toContain('Summary,Tasks Expiring <=60d,0,0 Soldiers affected');
		expect(result).not.toContain('11B');
		expect(response?.headers.get('Content-Type')).toBe('text/csv;charset=utf-8');
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="critical-task-report-/);
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});

	it('does not leak other-group readiness data for scoped viewers', async () => {
		const ctx = createTestContext({ auth: { scopedGroupId: 'group-alpha' } });
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
				id: 'task-common',
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
				ict_task_id: 'task-common',
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
				ict_task_id: 'task-common',
				completed_at: '2024-01-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2024-01-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: undefined,
			mos: undefined,
			role: undefined,
			rank: undefined
		});

		expect(result).toContain('Summary,Overall Readiness,100%');
		expect(result).toContain('Summary,Soldiers Below 70%,0,1 applicable Soldier');
		expect(result).not.toContain('11B');
	});

	it('includes filtered below-threshold task rows in worst-first order', async () => {
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
				id: 'p-alpha-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'One',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-alpha-2',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Alpha',
				first_name: 'Two',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-alpha-3',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Alpha',
				first_name: 'Three',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'Outside',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-worst',
				organization_id: ctx.auth.orgId,
				task_code: '071-000-0001',
				title: 'Maintain communications',
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
				task_code: '081-000-0002',
				title: 'Move under direct fire',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-ready',
				organization_id: ctx.auth.orgId,
				task_code: '081-000-0003',
				title: 'Conduct PCC and PCI',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-gap',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-1',
				ict_task_id: 'task-gap',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-1',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-2',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-3',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-3',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-bravo-not-exported',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-bravo',
				ict_task_id: 'task-worst',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});

		const worstTaskIndex = result.indexOf(
			'Tasks Below Unit Threshold,071-000-0001 Maintain communications,0%,3 Soldiers need it'
		);
		const gapTaskIndex = result.indexOf(
			'Tasks Below Unit Threshold,081-000-0002 Move under direct fire,33%,2 Soldiers need it'
		);
		expect(worstTaskIndex).toBeGreaterThan(-1);
		expect(gapTaskIndex).toBeGreaterThan(worstTaskIndex);
		expect(result).not.toContain('081-000-0003 Conduct PCC and PCI');
	});
});
