import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildLayoutContext, buildRouteContext, loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { fetchDashboardTrainingSummary } from '$lib/server/core/useCases/trainingSummaryQuery';
import { fetchCriticalTasksDashboardSummary } from '$lib/server/core/useCases/criticalTasksReportsQuery';
import { leaveOrganization } from '$lib/server/core/useCases/orgSettingsMemberManagement';
import type { UseCaseContext } from '$lib/server/core/ports';
import { withDashboardTiming } from '$lib/server/utils/dashboardTiming';
import type { IctReportDashboardSummary } from '$features/critical-tasks/utils/ictReports';
import type { DashboardIctlSummary } from '$features/dashboard/dashboard.types';
import type { DashboardWorkspaceResult } from '$features/dashboard/server/dashboardWorkspaceBootstrap';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchDashboardTrainingSummary>>['trainingSummary'] | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
}

function toDashboardIctlSummary(report: IctReportDashboardSummary): DashboardIctlSummary {
	const { overallReadiness, soldiersBelow70, tasksExpiringSoon, tasksBelowThreshold } = report.kpis;

	return {
		hasActiveTasks: report.hasActiveTasks,
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
		projectedReadinessPercent: report.projectedReadinessAtMonth6.readinessPercent,
		mosReadiness: report.mosReadiness.map((row) => ({
			mos: row.mos,
			personnelCount: row.personnelCount,
			readinessPercent: row.readinessPercent
		})),
		trend: report.readinessTrend.months.map((point) => ({
			month: point.month,
			label: point.label,
			readinessPercent: point.overallReadinessPercent
		})),
		tasksBelowThreshold: report.tasksBelowThreshold.rows.map((row) => ({
			taskId: row.taskId,
			taskCode: row.taskCode,
			taskName: row.taskName,
			percentComplete: row.percentComplete,
			soldierGapCount: row.soldierGapCount
		})),
		atRiskSoldiers: report.atRiskSoldiers.rows.map((row) => ({
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

	const report = await fetchCriticalTasksDashboardSummary(ctx);
	return toDashboardIctlSummary(report);
}

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;
	const parentData = await parent();
	const ctx = await buildLayoutContext(locals, cookies, orgId);
	const { data: summary } = loadWithContextCore(ctx, {
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		defer: true,
		fn: async () =>
			withDashboardTiming(orgId, 'summary', async () => {
				const workspaceBootstrap = parentData.dashboard.data as Promise<DashboardWorkspaceResult>;
				const workspaceData = (await workspaceBootstrap).data;
				const canViewCriticalTasks =
					parentData.shell.kind === 'ready' && parentData.shell.member.capabilityMap.criticalTasks !== 'none';
				const canViewTraining =
					parentData.shell.kind === 'ready' && parentData.shell.member.capabilityMap.training !== 'none';
				const trainingData = canViewTraining
					? await fetchDashboardTrainingSummary(ctx, {
							personnel: workspaceData.personnel,
							trainingTypes: workspaceData.trainingTypes,
							onboardingPersonnelIds: workspaceData.activeOnboardings.map((o) => o.personnelId),
							options: {
								// Fetch enough to guarantee 5 unique people after client-side deduplication
								issueLimit: 25,
								issueStatuses: ['expired', 'warning-orange']
							}
						})
					: null;

				return {
					trainingSummary: trainingData?.trainingSummary ?? null,
					ictlSummary: await loadDashboardIctlSummary(ctx, canViewCriticalTasks),
					onboardingTrainingCompletions: trainingData ? [...trainingData.onboardingTrainingCompletions] : []
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

				settings: createSupabaseOrgSettingsMemberManagementPort(event.locals)
			},
			{
				membershipId: (formData.get('membershipId') as string) ?? '',
				confirmation: (formData.get('confirmLeaveOrganization') as string) ?? '',
				actorEmail: user.email
			}
		);

		throw redirect(303, '/dashboard?show=all');
	}
};
