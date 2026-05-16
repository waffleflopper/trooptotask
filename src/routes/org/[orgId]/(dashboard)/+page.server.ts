import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoadEvent } from './$types';
import { buildLayoutContext, buildRouteContext, loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import { fetchDashboardTrainingSummary } from '$lib/server/core/useCases/trainingSummaryQuery';
import { fetchCriticalTasksReportDashboard } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { leaveOrganization } from '$lib/server/core/useCases/orgSettingsMemberManagement';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import { withDashboardTiming } from '$lib/server/utils/dashboardTiming';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';
import type { DashboardIctlSummary } from '$features/dashboard/dashboard.types';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchDashboardTrainingSummary>>['trainingSummary'];
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
}

function toDashboardIctlSummary(report: IctReportDashboard): DashboardIctlSummary {
	const { overallReadiness, soldiersBelow70, tasksExpiringSoon, tasksBelowThreshold } = report.kpis;

	return {
		hasActiveTasks: report.readinessMatrix.categories.length > 0 || overallReadiness.applicableCount > 0,
		overallReadinessPercent: overallReadiness.percent,
		overallDeltaPercent: overallReadiness.deltaPercent,
		readyCount: overallReadiness.readyCount,
		applicableCount: overallReadiness.applicableCount,
		soldiersBelowThresholdCount: soldiersBelow70.count,
		soldiersBelowThresholdTotal: soldiersBelow70.totalApplicable,
		thresholdPercent: soldiersBelow70.thresholdPercent,
		expiringSoonCount: tasksExpiringSoon.count,
		expiringSoonAffectedSoldiers: tasksExpiringSoon.affectedSoldiers,
		expiringSoonWindowDays: tasksExpiringSoon.windowDays,
		tasksBelowThresholdCount: tasksBelowThreshold.count,
		projectedReadinessPercent: report.expirationCliff.projectedReadinessAtMonth6.readinessPercent,
		mosReadiness: report.readinessMatrix.rows.slice(0, 3).map((row) => ({
			mos: row.mos,
			personnelCount: row.personnelCount,
			readinessPercent: row.averageReadinessPercent ?? 0
		})),
		trend: report.readinessTrend.months.slice(-6).map((point) => ({
			month: point.month,
			label: point.label,
			readinessPercent: point.overallReadinessPercent
		})),
		tasksBelowThreshold: report.tasksBelowThreshold.rows.slice(0, 3).map((row) => ({
			taskId: row.taskId,
			taskCode: row.taskCode,
			taskName: row.taskName,
			percentComplete: row.percentComplete,
			soldierGapCount: row.soldierGapCount
		})),
		atRiskSoldiers: report.atRiskSoldiers.rows.slice(0, 3).map((row) => ({
			personnelId: row.personnelId,
			soldierName: row.soldierName,
			mos: row.mos,
			rank: row.rank,
			groupName: row.groupName,
			readinessPercent: row.readinessPercent,
			tasksExpiringSoonCount: row.tasksExpiringSoonCount,
			daysSinceLastIctUpdate: row.daysSinceLastIctUpdate
		}))
	};
}

async function loadDashboardIctlSummary(
	ctx: UseCaseContext,
	canViewCriticalTasks: boolean
): Promise<DashboardIctlSummary | null> {
	if (!canViewCriticalTasks) return null;

	ctx.auth.requireView('critical-tasks');
	const report = await fetchCriticalTasksReportDashboard(ctx);
	return toDashboardIctlSummary(report);
}

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;
	const parentDataPromise = parent();
	const ctx = await buildLayoutContext(locals, cookies, orgId);
	const { data: summary } = loadWithContextCore(ctx, {
		permission: 'none',
		defer: true,
		fn: async () =>
			withDashboardTiming(orgId, 'summary', async () => {
				const parentData = await parentDataPromise;
				const workspaceBootstrap = parentData.dashboard.data as Promise<WorkspaceBootstrap<DashboardBootstrap>>;
				const workspaceData = (await workspaceBootstrap).data;
				const canViewCriticalTasks = parentData.permissions?.canViewCriticalTasks === true;
				const trainingData = await fetchDashboardTrainingSummary(ctx, {
					personnel: workspaceData.personnel,
					trainingTypes: workspaceData.trainingTypes,
					onboardingPersonnelIds: workspaceData.activeOnboardings.map((o) => o.personnelId),
					options: {
						// Fetch enough to guarantee 5 unique people after client-side deduplication
						issueLimit: 25,
						issueStatuses: ['expired', 'warning-orange']
					}
				});

				return {
					trainingSummary: trainingData.trainingSummary,
					ictlSummary: await loadDashboardIctlSummary(ctx, canViewCriticalTasks),
					onboardingTrainingCompletions: [...trainingData.onboardingTrainingCompletions]
				} satisfies DashboardPageSummaryData;
			})
	});

	return {
		summary
	};
};

export const actions: Actions = {
	leaveOrganization: async (event) => {
		const user = event.locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await event.request.formData();
		const ctx = await buildRouteContext(event);
		await leaveOrganization(
			{
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				readOnlyGuard: ctx.readOnlyGuard,
				settings: createSupabaseOrgSettingsMemberManagementPort(event.locals)
			},
			{
				membershipId: (formData.get('membershipId') as string) ?? '',
				actorEmail: user.email
			}
		);

		throw redirect(303, '/dashboard?show=all');
	}
};
