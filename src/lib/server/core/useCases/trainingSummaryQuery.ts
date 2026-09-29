/** Dashboard Training currency and Onboarding completion keys share one owned completion read. */
import type { QueryPorts } from '$lib/server/core/ports';
import type { Personnel } from '$lib/types';
import type { TrainingType, TrainingStatus, PersonnelTraining } from '$features/training/training.types';
import { getTrainingStats, getDelinquentTrainings, type TrainingStats } from '$features/training/utils/trainingStatus';
import { listTrainingCompletions } from '$features/training/index.server';

export interface TrainingIssue {
	personName: string;
	typeName: string;
	label: string;
	status: TrainingStatus;
	daysUntilExpiration: number | null;
}

export interface TrainingSummary {
	stats: TrainingStats;
	issues: TrainingIssue[];
}

export interface DashboardTrainingSummary {
	trainingSummary: TrainingSummary;
	onboardingTrainingCompletions: Set<string>;
}

export interface TrainingSummaryInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	options?: {
		groupId?: string;
		issueLimit?: number;
		issueStatuses?: TrainingStatus[];
		includeNotCompleted?: boolean;
	};
}

export interface DashboardTrainingSummaryInput extends TrainingSummaryInput {
	onboardingPersonnelIds: string[];
}

export async function fetchDashboardTrainingSummary(
	ctx: QueryPorts,
	input: DashboardTrainingSummaryInput
): Promise<DashboardTrainingSummary> {
	const { onboardingPersonnelIds, personnel, trainingTypes, options = {} } = input;
	const trainings = await listTrainingCompletions(ctx);

	return {
		trainingSummary: buildTrainingSummary(trainings, personnel, trainingTypes, options),
		onboardingTrainingCompletions: buildOnboardingTrainingCompletions(trainings, onboardingPersonnelIds)
	};
}

function buildTrainingSummary(
	trainings: PersonnelTraining[],
	personnel: Personnel[],
	trainingTypes: TrainingType[],
	options: TrainingSummaryInput['options'] = {}
): TrainingSummary {
	const { issueLimit = 5, issueStatuses = ['expired', 'warning-orange'], includeNotCompleted = false } = options;

	const stats = getTrainingStats(personnel, trainingTypes, trainings, options.groupId);

	const delinquent = getDelinquentTrainings(personnel, trainingTypes, trainings, {
		groupId: options.groupId,
		includeNotCompleted
	});

	const filtered = delinquent.filter((d) => issueStatuses.includes(d.statusInfo.status));

	const issues: TrainingIssue[] = filtered.slice(0, issueLimit).map((d) => ({
		personName: `${d.person.rank} ${d.person.lastName}, ${d.person.firstName}`,
		typeName: d.type.name,
		label: d.statusInfo.label,
		status: d.statusInfo.status,
		daysUntilExpiration: d.statusInfo.daysUntilExpiration
	}));

	return { stats, issues };
}

function buildOnboardingTrainingCompletions(trainings: PersonnelTraining[], personnelIds: string[]): Set<string> {
	if (personnelIds.length === 0) return new Set();

	const requestedIds = new Set(personnelIds);
	return new Set(
		trainings.filter((t) => requestedIds.has(t.personnelId)).map((t) => `${t.personnelId}-${t.trainingTypeId}`)
	);
}
