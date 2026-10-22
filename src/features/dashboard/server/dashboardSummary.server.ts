import { fetchDashboardTrainingSummary } from '$features/training/index.server';
import { fetchCriticalTasksDashboardSummary } from '$features/critical-tasks/index.server';
import type { IctReportDashboardSummary } from '$features/critical-tasks/contracts';
import type { OnboardingWorkflowPersistence } from '$features/onboarding/contracts';
import type { Personnel, PersonnelRosterReader } from '$features/personnel/contracts';
import type { TrainingCatalogPersistence, TrainingType } from '$features/training/contracts';
import type { DashboardBootstrap, DashboardIctlSummary, DashboardPageSummaryData } from '../contracts';
import { dashboardSourceAccess } from './dashboardSources.server';

type DashboardSummaryContext = Parameters<typeof fetchDashboardTrainingSummary>[0] &
	Parameters<typeof fetchCriticalTasksDashboardSummary>[0] &
	Parameters<typeof dashboardSourceAccess>[0];

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
	asOf: string,
	timeZone: string
): Promise<DashboardIctlSummary> {
	const report = await fetchCriticalTasksDashboardSummary(ctx, { asOf, timeZone });
	return toDashboardIctlSummary(report);
}

interface TrainingSummaryPopulation {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	onboardingPersonnelIds: string[];
}

export type DashboardSummaryRefreshContext = DashboardSummaryContext & {
	roster: Pick<PersonnelRosterReader, 'list'>;
	trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes'>;
	onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'listActivePacketPersonnelIds'>;
};

async function summarize(
	ctx: DashboardSummaryContext,
	readTrainingPopulation: () => Promise<TrainingSummaryPopulation>,
	asOf: string,
	timeZone: string
): Promise<DashboardPageSummaryData> {
	const reads = dashboardSourceAccess(ctx);
	const [trainingData, ictlSummary] = await Promise.all([
		reads('trainingSummary')
			? readTrainingPopulation().then(async (inputs) => ({
					onboardingPersonnelIds: [...new Set(inputs.onboardingPersonnelIds)],
					summary: await fetchDashboardTrainingSummary(ctx, {
						personnel: inputs.personnel,
						trainingTypes: inputs.trainingTypes,
						onboardingPersonnelIds: inputs.onboardingPersonnelIds,
						options: { issueLimit: 25, issueStatuses: ['expired', 'warning-orange'] },
						asOf
					})
				}))
			: null,
		reads('ictlSummary') ? loadDashboardIctlSummary(ctx, asOf, timeZone) : null
	]);
	return {
		trainingSummary: trainingData?.summary.trainingSummary ?? null,
		ictlSummary,
		onboardingTrainingCompletions: trainingData ? [...trainingData.summary.onboardingTrainingCompletions] : [],
		onboardingPersonnelIds: trainingData?.onboardingPersonnelIds ?? []
	};
}

export function fetchDashboardSummary(
	ctx: DashboardSummaryContext,
	workspace: Pick<DashboardBootstrap, 'personnel' | 'trainingTypes' | 'activeOnboardings'>,
	asOf: string,
	timeZone: string
): Promise<DashboardPageSummaryData> {
	return summarize(
		ctx,
		async () => ({
			personnel: workspace.personnel,
			trainingTypes: workspace.trainingTypes,
			onboardingPersonnelIds: workspace.activeOnboardings.map((packet) => packet.personnelId)
		}),
		asOf,
		timeZone
	);
}

export function refreshDashboardSummary(
	ctx: DashboardSummaryRefreshContext,
	asOf: string,
	timeZone: string
): Promise<DashboardPageSummaryData> {
	const reads = dashboardSourceAccess(ctx);
	const readTrainingPopulation = async (): Promise<TrainingSummaryPopulation> => {
		const [personnel, trainingTypes, onboardingPersonnelIds] = await Promise.all([
			ctx.roster.list({ status: 'active' }),
			reads('trainingTypes') ? ctx.trainingCatalog.listTypes() : [],
			reads('activeOnboardings') ? ctx.onboardingWorkflow.listActivePacketPersonnelIds() : []
		]);
		return { personnel, trainingTypes, onboardingPersonnelIds };
	};
	return summarize(ctx, readTrainingPopulation, asOf, timeZone);
}
