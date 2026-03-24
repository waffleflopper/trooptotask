import type { UseCaseContext } from '$lib/server/core/ports';
import type { Personnel } from '$lib/types';
import type { TrainingType, TrainingStatus, PersonnelTraining } from '$features/training/training.types';
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

export async function fetchTrainingSummary(ctx: UseCaseContext, input: TrainingSummaryInput): Promise<TrainingSummary> {
	const { personnel, trainingTypes, options = {} } = input;
	const { issueLimit = 5, issueStatuses = ['expired', 'warning-orange'], includeNotCompleted = false } = options;

	const trainings = await fetchTrainings(ctx);

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

async function fetchTrainings(ctx: UseCaseContext): Promise<PersonnelTraining[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
	return PersonnelTrainingEntity.fromDbArray(rows);
}

export interface TrainingSummaryByGroupInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	options?: {
		issueLimit?: number;
		issueStatuses?: TrainingStatus[];
		includeNotCompleted?: boolean;
	};
}

export async function fetchTrainingSummaryByGroup(
	ctx: UseCaseContext,
	input: TrainingSummaryByGroupInput
): Promise<Map<string, TrainingSummary>> {
	const { personnel, trainingTypes, options = {} } = input;
	const { issueLimit = 5, issueStatuses = ['expired', 'warning-orange'], includeNotCompleted = false } = options;

	const trainings = await fetchTrainings(ctx);

	const groupMap = new Map<string, Personnel[]>();
	for (const p of personnel) {
		const key = p.groupId ?? 'ungrouped';
		if (!groupMap.has(key)) groupMap.set(key, []);
		groupMap.get(key)!.push(p);
	}

	const result = new Map<string, TrainingSummary>();
	for (const [groupId, groupPersonnel] of groupMap) {
		const gid = groupId === 'ungrouped' ? undefined : groupId;
		const stats = getTrainingStats(groupPersonnel, trainingTypes, trainings, gid);
		const delinquent = getDelinquentTrainings(groupPersonnel, trainingTypes, trainings, {
			groupId: gid,
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
		result.set(groupId, { stats, issues });
	}

	return result;
}

export interface TrainingSummaryByTypeInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	options?: { groupId?: string };
}

export async function fetchTrainingSummaryByType(
	ctx: UseCaseContext,
	input: TrainingSummaryByTypeInput
): Promise<Map<string, TrainingStats>> {
	const { personnel, trainingTypes, options = {} } = input;
	const trainings = await fetchTrainings(ctx);

	const result = new Map<string, TrainingStats>();
	for (const type of trainingTypes) {
		const stats = getTrainingStats(personnel, [type], trainings, options.groupId);
		result.set(type.id, stats);
	}

	return result;
}

export interface OnboardingTrainingCompletionsInput {
	personnelIds: string[];
}

export async function fetchOnboardingTrainingCompletions(
	ctx: UseCaseContext,
	input: OnboardingTrainingCompletionsInput
): Promise<Set<string>> {
	if (input.personnelIds.length === 0) return new Set();

	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId, undefined, {
		select: 'personnel_id, training_type_id'
	});
	const trainings = PersonnelTrainingEntity.fromDbArray(rows);

	const requestedIds = new Set(input.personnelIds);
	return new Set(
		trainings.filter((t) => requestedIds.has(t.personnelId)).map((t) => `${t.personnelId}-${t.trainingTypeId}`)
	);
}
