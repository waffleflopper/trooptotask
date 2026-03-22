import type { SupabaseClient } from '@supabase/supabase-js';
import type { Personnel } from '$lib/types';
import type { TrainingType, TrainingStatus } from '$features/training/training.types';
import { getTrainingStats, getDelinquentTrainings, type TrainingStats } from '$features/training/utils/trainingStatus';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

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

export interface TrainingSummaryOptions {
	groupId?: string;
	issueLimit?: number;
	issueStatuses?: TrainingStatus[];
	includeNotCompleted?: boolean;
}

export async function getTrainingSummary(
	supabase: SupabaseClient,
	orgId: string,
	personnel: Personnel[],
	trainingTypes: TrainingType[],
	options: TrainingSummaryOptions = {}
): Promise<TrainingSummary> {
	const trainings = await PersonnelTrainingEntity.repo.list(supabase, orgId);

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

export async function getOnboardingTrainingCompletions(
	supabase: SupabaseClient,
	orgId: string,
	personnelIds: string[]
): Promise<Set<string>> {
	if (personnelIds.length === 0) return new Set();

	const result = await PersonnelTrainingEntity.repo.queryByIds(supabase, orgId, 'personnel_id', personnelIds, {
		select: 'personnel_id, training_type_id'
	});

	return new Set(result.data.map((t) => `${t.personnelId}-${t.trainingTypeId}`));
}
