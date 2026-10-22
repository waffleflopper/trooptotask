import { fetchDashboardTrainingSummary } from '$features/training/index.server';
import { fetchCriticalTasksDashboardSummary } from '$features/critical-tasks/index.server';
import type { IctReportDashboardSummary } from '$features/critical-tasks/contracts';
import type { DashboardBootstrap, DashboardIctlSummary, DashboardPageSummaryData } from '../contracts';

type DashboardSummaryContext = Parameters<typeof fetchDashboardTrainingSummary>[0] &
	Parameters<typeof fetchCriticalTasksDashboardSummary>[0];

function toDashboardIctlSummary(report: IctReportDashboardSummary): DashboardIctlSummary {
	const { overallReadiness, soldiersBelow70, tasksExpiringSoon, tasksBelowThreshold } = report.kpis;

	return {
		hasActiveTasks: report.hasActiveTasks,
		overallReadinessPercent: overallReadiness.percent,
		overallDeltaPercent: overallReadiness.deltaPercent,
		readyCount: overallReadiness.readyCount,
		applicableCount: overallReadiness.applicableCount,
		soldiersBelowThresholdCount: soldiersBelow70.count,
		soldiersAtRiskCount: report.atRiskSoldiers.lapsingAboveThresholdCount,
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
	ctx: Parameters<typeof fetchCriticalTasksDashboardSummary>[0],
	canViewCriticalTasks: boolean,
	asOf: string,
	timeZone: string
): Promise<DashboardIctlSummary | null> {
	if (!canViewCriticalTasks) return null;

	const report = await fetchCriticalTasksDashboardSummary(ctx, { asOf, timeZone });
	return toDashboardIctlSummary(report);
}

export async function fetchDashboardSummary(
	ctx: DashboardSummaryContext,
	workspace: DashboardBootstrap,
	access: { training: boolean; criticalTasks: boolean },
	asOf: string,
	timeZone: string
): Promise<DashboardPageSummaryData> {
	const [trainingData, ictlSummary] = await Promise.all([
		access.training
			? fetchDashboardTrainingSummary(ctx, {
					personnel: workspace.personnel,
					trainingTypes: workspace.trainingTypes,
					onboardingPersonnelIds: workspace.activeOnboardings.map((o) => o.personnelId),
					options: { issueLimit: 25, issueStatuses: ['expired', 'warning-orange'] },
					asOf
				})
			: null,
		loadDashboardIctlSummary(ctx, access.criticalTasks, asOf, timeZone)
	]);
	return {
		trainingSummary: trainingData?.trainingSummary ?? null,
		ictlSummary,
		onboardingTrainingCompletions: trainingData ? [...trainingData.onboardingTrainingCompletions] : []
	};
}
