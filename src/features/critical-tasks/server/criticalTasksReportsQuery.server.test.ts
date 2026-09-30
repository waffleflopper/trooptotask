import { createInMemoryCriticalTasksReadModelAdapter } from './inMemoryCriticalTasksReadModel.server';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';
import { buildCriticalTasksReportWorkbook } from '$features/critical-tasks/utils/ictWorkbookExport';
import {
	fetchCriticalTasksDashboardSummary,
	fetchCriticalTasksReportDashboard,
	fetchCriticalTasksReportsPageModel
} from './criticalTasksReportsQuery.server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ExcelJS.Buffer): WorkbookLoadBuffer {
	return buffer as WorkbookLoadBuffer;
}

describe('Critical Tasks report queries', () => {
	it('builds the filtered dashboard payload inside the scoped group boundary', async () => {
		const ctx = createTestContext({
			criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter,
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'view',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
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
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = ((table, orgId, filters, options) =>
			table === 'personnel'
				? Promise.reject(new Error('Personnel SELECT denied for this Critical Tasks-only actor'))
				: table === 'organization_rank_catalog'
					? Promise.resolve([])
					: requestFindMany(table, orgId, filters, options)) as typeof ctx.store.findMany;
		const privilegedFindMany = ctx.rawStore.findMany.bind(ctx.rawStore);
		ctx.rawStore.findMany = ((table, orgId, filters, options) =>
			table === 'organization_rank_catalog'
				? Promise.reject(new Error('Report rank catalog must use the authorized request store'))
				: privilegedFindMany(table, orgId, filters, options)) as typeof ctx.rawStore.findMany;

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

	it('uses the organization expiring-soon window when calculating report dashboard risk', async () => {
		const ctx = createTestContext({ criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter });
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
		const ctx = createTestContext({ criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter });
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
				ranks: ['SGT', 'CPL'],
				roles: ['Medic', 'Rifleman']
			}
		});
		expect(pageModel.initialDashboard.kpis.overallReadiness).toMatchObject({
			percent: 0,
			readyCount: 0,
			applicableCount: 2
		});
	});

	it('keeps observed active, retired, discovered, and unknown Personnel ranks in report scope filters', async () => {
		const ctx = createTestContext({ criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter });
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('personnel', [
			personnelRow(ctx.auth.orgId, { id: 'p-retired', rank: 'SP4' }),
			personnelRow(ctx.auth.orgId, { id: 'p-discovered', rank: 'SGT' }),
			personnelRow(ctx.auth.orgId, { id: 'p-unknown', rank: 'LOCAL-CADET' })
		]);
		ctx.store.seed('organization_rank_catalog', [
			rankCatalogRow(ctx.auth.orgId, {
				code: 'PO2',
				label: 'Petty Officer Second Class',
				service: 'navy',
				pay_grade: 'E-5'
			}),
			rankCatalogRow(ctx.auth.orgId, {
				code: 'SSgt',
				label: 'Staff Sergeant',
				service: 'air-force',
				pay_grade: 'E-5'
			}),
			rankCatalogRow(ctx.auth.orgId, { code: 'SP4', label: 'Specialist Four', state: 'retired', pay_grade: 'E-4' })
		]);

		const pageModel = await fetchCriticalTasksReportsPageModel(ctx);

		expect(pageModel.reportScope.filterOptions.ranks).toEqual(['SGT', 'SP4', 'LOCAL-CADET']);
	});

	it('builds expiration cliff buckets after scoped access and report filters are applied', async () => {
		const ctx = createTestContext({
			criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter,
			auth: { scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } }
		});
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

function personnelRow(orgId: string, overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? 'person-1',
		organization_id: orgId,
		rank: overrides.rank ?? 'SGT',
		last_name: overrides.last_name ?? 'Soldier',
		first_name: overrides.first_name ?? 'Test',
		mos: overrides.mos ?? '68W',
		clinic_role: overrides.clinic_role ?? 'Medic',
		group_id: null,
		archived_at: null,
		groups: null,
		...overrides
	};
}

function rankCatalogRow(orgId: string, overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? `rank-${overrides.code ?? 'SGT'}`,
		organization_id: orgId,
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		pay_grade: overrides.pay_grade ?? 'E-5',
		state: overrides.state ?? 'active',
		source: overrides.source ?? 'custom',
		sort_order: overrides.sort_order ?? 0,
		...overrides
	};
}

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

function createWideHistoryContext(
	dimension: 'people' | 'tasks',
	options: { failLastHistory?: boolean; forbidHistory?: boolean } = {}
) {
	const ctx = createTestContext({
		criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter,
		auth: {
			scopeSet: { kind: 'groups', groupIds: ['alpha'] },
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				personnel: 'none',
				criticalTasks: 'view',
				training: 'none',
				calendar: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	const id = (kind: number, index: number) =>
		`${String(kind).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
	const people = Array.from({ length: dimension === 'people' ? 501 : 1 }, (_, index) => ({
		id: id(1, index),
		organization_id: ctx.auth.orgId,
		first_name: 'Synthetic',
		last_name: `Person${index}`,
		mos: '68W',
		group_id: 'alpha',
		archived_at: null
	}));
	const tasks = Array.from({ length: dimension === 'tasks' ? 501 : 1 }, (_, index) => ({
		id: id(2, index),
		organization_id: ctx.auth.orgId,
		task_code: `TASK${index}`,
		title: `Task${index}`,
		mos: [],
		expiration_months: 1,
		sort_order: index,
		archived_at: null
	}));
	const history = people.flatMap((person) =>
		tasks.flatMap((task) =>
			['2026-01-01', '2026-03-15'].map((date) => ({
				id: `${person.id}:${task.id}:${date}`,
				organization_id: ctx.auth.orgId,
				personnel_id: person.id,
				ict_task_id: task.id,
				completed_at: date,
				created_at: `${date}T12:00:00Z`,
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: null
			}))
		)
	);
	const excludedPerson = id(1, 999);
	ctx.store.seed('personnel', [...people, { ...people[0], id: excludedPerson, group_id: 'bravo' }]);
	ctx.store.seed('ict_tasks', tasks);
	ctx.store.seed('organizations', [
		{ id: ctx.auth.orgId, critical_tasks_default_expiration_months: 1, critical_tasks_expiring_soon_warning_days: 7 }
	]);
	ctx.store.seed('groups', [{ id: 'alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 }]);
	const client = createClient('https://provider.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.href.length > 8192) return Response.json({ message: 'URI too long' }, { status: 414 });
				const ids = (column: string) => url.searchParams.get(column)?.slice(4, -1).split(',') ?? [];
				expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
				expect(ids('personnel_id')).not.toContain(excludedPerson);
				if (options.failLastHistory && ids('personnel_id').includes(people.at(-1)!.id))
					return Response.json({ message: 'Required history unavailable' }, { status: 403 });
				const selected = history.filter(
					(row) => ids('personnel_id').includes(row.personnel_id) && ids('ict_task_id').includes(row.ict_task_id)
				);
				const offset = Number(url.searchParams.get('offset') ?? 0);
				return Response.json(selected.slice(offset, offset + 1000));
			}
		}
	});
	const provider = createSupabaseDataStore(client);
	const findMany = ctx.store.findMany.bind(ctx.store);
	vi.spyOn(ctx.store, 'findMany').mockImplementation((...args) =>
		args[0] === 'personnel_ict_completions'
			? options.forbidHistory
				? Promise.reject(new Error('Excluded history must not be read'))
				: provider.findMany(...args)
			: findMany(...args)
	);
	return ctx;
}

describe('bounded Critical Tasks report history', () => {
	it.each(['people', 'tasks'] as const)(
		'retains older readiness dates for 501 %s through a URL-limited provider',
		async (dimension) => {
			const ctx = createWideHistoryContext(dimension);
			const dashboard = await fetchCriticalTasksReportDashboard(ctx, { asOf: '2026-03-20' });
			expect(dashboard.kpis.overallReadiness).toMatchObject({ percent: 100, readyCount: 501, applicableCount: 501 });
			expect(
				dashboard.readinessTrend.months.slice(-3).map((point) => [point.month, point.overallReadinessPercent])
			).toEqual([
				['2026-01', 100],
				['2026-02', 0],
				['2026-03', 100]
			]);
			const summary = await fetchCriticalTasksDashboardSummary(ctx, { asOf: '2026-03-20' });
			expect(summary.kpis.overallReadiness).toMatchObject({ percent: 100, readyCount: 501, applicableCount: 501 });
			expect(
				summary.readinessTrend.months.slice(-3).map((point) => [point.month, point.overallReadinessPercent])
			).toEqual([
				['2026-01', 100],
				['2026-02', 0],
				['2026-03', 100]
			]);
		}
	);

	it('returns an empty authorized report for an excluded group without reading history', async () => {
		const ctx = createWideHistoryContext('people', { forbidHistory: true });
		const dashboard = await fetchCriticalTasksReportDashboard(ctx, {
			filters: { groupId: 'bravo' },
			asOf: '2026-03-20'
		});
		expect(dashboard.kpis.overallReadiness).toMatchObject({ percent: 0, readyCount: 0, applicableCount: 0 });
		expect(dashboard.atRiskSoldiers.rows).toEqual([]);
	});

	it('rejects an unavailable history window instead of returning a partial report', async () => {
		const ctx = createWideHistoryContext('people', { failLastHistory: true });
		await expect(fetchCriticalTasksReportDashboard(ctx, { asOf: '2026-03-20' })).rejects.toThrow(
			'Required history unavailable'
		);
		await expect(fetchCriticalTasksDashboardSummary(ctx, { asOf: '2026-03-20' })).rejects.toThrow(
			'Required history unavailable'
		);
	});
});

describe('deep Critical Tasks dated history', () => {
	it.each([
		[1, 100],
		[151, 1]
	])('retains first and last historical dates for %i authorized People', async (personCount, expectedPercent) => {
		const ctx = createTestContext({ criticalTasksReadModelFactory: createInMemoryCriticalTasksReadModelAdapter });
		const people = Array.from({ length: personCount }, (_, i) => ({
			id: `deep-person-${i}`,
			organization_id: ctx.auth.orgId,
			first_name: 'Synthetic',
			last_name: `Deep${i}`,
			mos: '68W',
			group_id: null,
			archived_at: null
		}));
		ctx.store.seed('personnel', people);
		ctx.store.seed('ict_tasks', [
			{
				id: 'deep-task',
				organization_id: ctx.auth.orgId,
				task_code: 'DEEP',
				title: 'Deep history',
				mos: [],
				expiration_months: 1,
				archived_at: null
			}
		]);
		ctx.store.seed('organizations', [
			{ id: ctx.auth.orgId, critical_tasks_default_expiration_months: 1, critical_tasks_expiring_soon_warning_days: 7 }
		]);
		const history = Array.from({ length: 150000 }, (_, i) => ({
			id: `deep-completion-${i}`,
			organization_id: ctx.auth.orgId,
			personnel_id: people[0].id,
			ict_task_id: 'deep-task',
			completed_at: i === 149999 ? '2026-03-15' : '2026-01-01',
			created_at: '2026-03-15T12:00:00Z',
			validation_method: 'Demonstration',
			validated_by: null,
			notes: null,
			logged_by: null
		}));
		const findMany = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((...args) =>
			args[0] === 'personnel_ict_completions'
				? Promise.resolve(args[3]?.inFilters?.personnel_id?.includes(people[0].id) ? history : [])
				: findMany(...args)
		);
		const summary = await fetchCriticalTasksDashboardSummary(ctx, { asOf: '2026-03-20' });
		expect(summary.kpis.overallReadiness).toMatchObject({
			readyCount: 1,
			applicableCount: personCount,
			percent: expectedPercent
		});
		expect(
			summary.readinessTrend.months.slice(-3).map((point) => [point.month, point.overallReadinessPercent])
		).toEqual([
			['2026-01', expectedPercent],
			['2026-02', 0],
			['2026-03', expectedPercent]
		]);
	});
});
