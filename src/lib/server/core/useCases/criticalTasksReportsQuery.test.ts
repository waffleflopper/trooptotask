import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCriticalTasksReportDashboard, fetchCriticalTasksReportSummary } from './criticalTasksReportsQuery';

describe('fetchCriticalTasksReportSummary', () => {
	it('builds the filtered dashboard payload inside the scoped group boundary', async () => {
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
				id: 'p-medic',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Medic',
				first_name: 'Maya',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-rifle',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Rifle',
				first_name: 'Ryan',
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
				last_name: 'Outside',
				first_name: 'Owen',
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
				task_code: '081-833-0010',
				title: 'Open airway',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-medic',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-medic',
				ict_task_id: 'task-common',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-bravo',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-bravo',
				ict_task_id: 'task-common',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			}
		]);

		const dashboard = await fetchCriticalTasksReportDashboard(ctx, {
			filters: { mos: ['68W', '11B'] },
			asOf: '2026-02-01'
		});

		expect(dashboard.kpis.overallReadiness).toMatchObject({
			percent: 50,
			readyCount: 1,
			applicableCount: 2
		});
		expect(dashboard.kpis.soldiersBelow70).toMatchObject({
			count: 1,
			totalAssigned: 2
		});
	});

	it('counts only MOS-applicable completion events in the report trend', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-rifle',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Rifle',
				first_name: 'Ryan',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-common',
				organization_id: ctx.auth.orgId,
				task_code: '071-000-0101',
				title: 'Conduct PCC/PCI',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-medic',
				organization_id: ctx.auth.orgId,
				task_code: '081-68W-0101',
				title: 'Perform Needle Chest Decompression',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-common',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-rifle',
				ict_task_id: 'task-common',
				completed_at: '2026-04-10',
				validation_method: 'Practical Exercise',
				validated_by: 'SFC Stone',
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-04-10T12:00:00Z'
			},
			{
				id: 'completion-non-applicable',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-rifle',
				ict_task_id: 'task-medic',
				completed_at: '2026-04-12',
				validation_method: 'Demonstration',
				validated_by: 'SFC Stone',
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-04-12T12:00:00Z'
			}
		]);

		const summary = await fetchCriticalTasksReportSummary(ctx, {});

		expect(summary.completionTrend).toEqual([{ month: '2026-04', completions: 1 }]);
	});
});
