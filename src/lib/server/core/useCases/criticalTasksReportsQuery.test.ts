import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';
import { buildCriticalTasksReportWorkbook } from '$features/critical-tasks/utils/ictWorkbookExport';
import {
	fetchCriticalTasksDashboardSummary,
	fetchCriticalTasksReportDashboard,
	fetchCriticalTasksReportsPageModel,
	fetchCriticalTasksReportSummary
} from './criticalTasksReportsQuery';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ExcelJS.Buffer): WorkbookLoadBuffer {
	return buffer as WorkbookLoadBuffer;
}

describe('fetchCriticalTasksReportSummary', () => {
	it('builds the filtered dashboard payload inside the scoped group boundary', async () => {
		const ctx = createTestContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } } });
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
				category: 'Medical',
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
			totalApplicable: 2
		});
		expect(dashboard.tasksBelowThreshold.rows).toEqual([
			{
				taskId: 'task-common',
				taskCode: '081-833-0010',
				taskName: 'Open airway',
				percentComplete: 50,
				soldierGapCount: 1,
				applicableCount: 2,
				completeCount: 1
			}
		]);
		expect(dashboard.readinessMatrix.categories.map(({ label }) => label)).toEqual(['Medical']);
		expect(
			dashboard.readinessMatrix.rows.map((row) => ({
				mos: row.mos,
				personnelCount: row.personnelCount,
				averageReadinessPercent: row.averageReadinessPercent,
				averageReadyCount: row.averageReadyCount,
				averageApplicableCount: row.averageApplicableCount
			}))
		).toEqual([
			{
				mos: '11B',
				personnelCount: 1,
				averageReadinessPercent: 0,
				averageReadyCount: 0,
				averageApplicableCount: 1
			},
			{
				mos: '68W',
				personnelCount: 1,
				averageReadinessPercent: 100,
				averageReadyCount: 1,
				averageApplicableCount: 1
			}
		]);
		expect(dashboard.readinessDistribution.defaultMos).toBe('11B');
		expect(
			dashboard.readinessDistribution.series.map(({ mos, personnelCount, bins }) => ({
				mos,
				personnelCount,
				counts: bins.map((bin) => bin.soldierCount)
			}))
		).toEqual([
			{ mos: '11B', personnelCount: 1, counts: [1, 0, 0, 0, 0] },
			{ mos: '68W', personnelCount: 1, counts: [0, 0, 0, 0, 1] }
		]);
		expect(dashboard.atRiskSoldiers.rows).toEqual([
			{
				personnelId: 'p-rifle',
				soldierName: 'Rifle, Ryan',
				mos: '11B',
				rank: 'CPL',
				groupName: 'Alpha',
				readinessPercent: 0,
				applicableCount: 1,
				readyCount: 0,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: null,
				lastIctUpdateAt: null
			},
			{
				personnelId: 'p-medic',
				soldierName: 'Medic, Maya',
				mos: '68W',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 100,
				applicableCount: 1,
				readyCount: 1,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: 17,
				lastIctUpdateAt: '2026-01-15T00:00:00Z'
			}
		]);

		const summary = await fetchCriticalTasksDashboardSummary(ctx, {
			filters: { mos: ['68W', '11B'] },
			asOf: '2026-02-01'
		});

		expect(summary.kpis).toEqual(dashboard.kpis);
		expect(summary.mosReadiness).toEqual([
			{
				mos: '11B',
				personnelCount: 1,
				readinessPercent: 0,
				readyCount: 0,
				applicableCount: 1
			},
			{
				mos: '68W',
				personnelCount: 1,
				readinessPercent: 100,
				readyCount: 1,
				applicableCount: 1
			}
		]);
		expect(summary.tasksBelowThreshold).toEqual({
			thresholdPercent: 70,
			count: 1,
			rows: dashboard.tasksBelowThreshold.rows
		});
		expect(summary.atRiskSoldiers).toEqual({
			totalApplicable: 2,
			rows: dashboard.atRiskSoldiers.rows
		});
		expect(summary).not.toHaveProperty('readinessDistribution');
		expect(summary).not.toHaveProperty('readinessMatrix');
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

	it('uses the organization expiring-soon window when calculating report dashboard risk', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 45
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
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-expiring-within-org-window',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-rifle',
				ict_task_id: 'task-common',
				completed_at: '2025-03-25',
				validation_method: 'Practical Exercise',
				validated_by: 'SFC Stone',
				notes: null,
				logged_by: 'user-1',
				created_at: '2025-03-25T12:00:00Z'
			}
		]);

		const dashboard = await fetchCriticalTasksReportDashboard(ctx, { asOf: '2026-02-15' });

		expect(dashboard.kpis.tasksExpiringSoon).toEqual({
			count: 1,
			affectedSoldiers: 1,
			windowDays: 45
		});
		expect(dashboard.atRiskSoldiers.rows[0]).toMatchObject({
			personnelId: 'p-rifle',
			tasksExpiringSoonCount: 1
		});
	});

	it('builds the reports page model from one server-shaped report scope', async () => {
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
				category: 'Medical',
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const pageModel = await fetchCriticalTasksReportsPageModel(ctx, { asOf: '2026-04-15' });

		expect(pageModel.reportScope).toEqual({
			personnel: [
				{ id: 'p-medic', groupId: 'group-alpha', mos: '68W', rank: 'SGT', dutyRole: 'Medic' },
				{ id: 'p-rifle', groupId: 'group-bravo', mos: '11B', rank: 'CPL', dutyRole: 'Rifleman' }
			],
			groups: [
				{ id: 'group-alpha', name: 'Alpha' },
				{ id: 'group-bravo', name: 'Bravo' }
			],
			hasActiveTasks: true,
			activeTaskCount: 1,
			totalPersonnelCount: 2,
			filterOptions: {
				mos: ['11B', '68W'],
				ranks: ['CPL', 'SGT'],
				roles: ['Medic', 'Rifleman']
			}
		});
		expect(pageModel.initialDashboard.kpis.overallReadiness).toMatchObject({
			percent: 0,
			readyCount: 0,
			applicableCount: 2
		});
	});

	it('builds expiration cliff buckets after scoped access and report filters are applied', async () => {
		const ctx = createTestContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } } });
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 3,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-alpha-medic',
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
				id: 'p-alpha-rifle',
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
				id: 'p-bravo-medic',
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
				expiration_months: null,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-alpha-medic',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-medic',
				ict_task_id: 'task-common',
				completed_at: '2026-02-20',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-02-20T00:00:00Z'
			},
			{
				id: 'completion-alpha-rifle',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-rifle',
				ict_task_id: 'task-common',
				completed_at: '2026-02-20',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-02-20T00:00:00Z'
			},
			{
				id: 'completion-bravo-medic',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-bravo-medic',
				ict_task_id: 'task-common',
				completed_at: '2026-02-20',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-02-20T00:00:00Z'
			}
		]);

		const dashboard = await fetchCriticalTasksReportDashboard(ctx, {
			filters: { mos: ['68W'] },
			asOf: '2026-04-15'
		});

		expect(dashboard.expirationCliff.mosSeries).toEqual(['68W']);
		expect(dashboard.expirationCliff.months.map((month) => [month.month, month.totalExpiringCount])).toEqual([
			['2026-04', 0],
			['2026-05', 1],
			['2026-06', 0],
			['2026-07', 0],
			['2026-08', 0],
			['2026-09', 0]
		]);
		expect(dashboard.expirationCliff.projectedReadinessAtMonth6).toMatchObject({
			month: '2026-09',
			readinessPercent: 0,
			readyCount: 0,
			applicableCount: 1
		});
	});
});

describe('buildCriticalTasksReportWorkbook', () => {
	it('orders action rows before summary metadata while preserving handoff context', async () => {
		const dashboard: IctReportDashboard = {
			kpis: {
				overallReadiness: {
					percent: 68,
					deltaPercent: -3,
					readyCount: 17,
					applicableCount: 25
				},
				soldiersBelow70: {
					count: 2,
					totalApplicable: 3,
					thresholdPercent: 65
				},
				tasksExpiringSoon: {
					count: 0,
					affectedSoldiers: 0,
					windowDays: 45
				},
				tasksBelowThreshold: {
					count: 1,
					thresholdPercent: 70
				}
			},
			tasksBelowThreshold: {
				thresholdPercent: 70,
				rows: [
					{
						taskId: 'task-comms',
						taskCode: '071-000-0001',
						taskName: 'Maintain communications',
						percentComplete: 33,
						soldierGapCount: 2,
						applicableCount: 3,
						completeCount: 1
					}
				]
			},
			atRiskSoldiers: {
				rows: [
					{
						personnelId: 'p-rifle',
						soldierName: 'Rifle, Ryan',
						rank: 'SGT',
						mos: '11B',
						groupName: 'Alpha',
						readinessPercent: 40,
						applicableCount: 5,
						readyCount: 2,
						tasksExpiringSoonCount: 1,
						daysSinceLastIctUpdate: 12,
						lastIctUpdateAt: '2026-04-01T00:00:00Z'
					}
				]
			},
			readinessTrend: {
				comparisonMos: [],
				months: []
			},
			expirationCliff: {
				mosSeries: [],
				months: [],
				projectedReadinessAtMonth6: {
					month: '2026-09',
					label: 'Sep 2026',
					readinessPercent: 68,
					readyCount: 17,
					applicableCount: 25
				}
			},
			readinessMatrix: {
				hasCategorizedTasks: false,
				categories: [],
				rows: []
			},
			readinessDistribution: {
				bins: [],
				defaultMos: null,
				series: []
			}
		};

		const workbook = await buildCriticalTasksReportWorkbook(dashboard);
		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(toWorkbookBuffer(await workbook.xlsx.writeBuffer()));
		const sheet = parsed.getWorksheet('Critical Tasks Report')!;

		expect(sheet.getRow(1).values).toEqual([undefined, 'Section', 'Metric', 'Value', 'Subtitle']);
		expect(sheet.getRow(2).values).toEqual([
			undefined,
			'At-Risk Soldiers',
			'Rifle, Ryan',
			'40%',
			'SGT 11B; Alpha; 1 expiring <=45d; 12 days since update'
		]);
		expect(sheet.getRow(3).values).toEqual([
			undefined,
			'Tasks Below Unit Threshold',
			'071-000-0001 Maintain communications',
			'33%',
			'2 Soldiers need it'
		]);
		expect(sheet.getRow(4).values).toEqual([undefined, 'Summary', 'Overall Readiness', '68%', '-3 pts vs 30d']);
		expect(sheet.getRow(5).values).toEqual([undefined, 'Summary', 'Soldiers Below 65%', 2, '3 applicable Soldiers']);
		expect(sheet.getColumn(2).values).not.toContain('Soldiers Below 70%');
		expect(sheet.getColumn(4).values).not.toContain('assigned');
	});
});
