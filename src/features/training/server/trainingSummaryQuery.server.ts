/** Dashboard Training currency and Onboarding completion keys share one owned completion read. */
import type { Personnel } from '$features/personnel/contracts';
import type {
	TrainingType,
	TrainingCompletionFacts,
	ExpiredTrainingType,
	TrainingIssue,
	TrainingSummary,
	TrainingSummaryInput,
	DashboardTrainingSummary,
	DashboardTrainingSummaryInput
} from '../contracts';
import { getTrainingStats, getDelinquentTrainings } from '../utils/trainingStatus';
import { listTrainingReadinessCompletions } from './trainingCompletionRead.server';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';

export async function fetchDashboardTrainingSummary(
	ctx: TrainingCompletionReadContext,
	input: DashboardTrainingSummaryInput
): Promise<DashboardTrainingSummary> {
	const { onboardingPersonnelIds, personnel, trainingTypes, options = {}, asOf } = input;
	const summaryPeople = options.groupId ? personnel.filter((person) => person.groupId === options.groupId) : personnel;
	const summaryTypeIdsWithoutOnboarding =
		onboardingPersonnelIds.length === 0 ? trainingTypes.map((type) => type.id) : undefined;
	const trainings = await listTrainingReadinessCompletions(ctx, {
		personnelIds: [...summaryPeople.map((person) => person.id), ...onboardingPersonnelIds],
		trainingTypeIds: summaryTypeIdsWithoutOnboarding
	});

	return {
		trainingSummary: buildTrainingSummary(trainings, personnel, trainingTypes, asOf, options),
		onboardingTrainingCompletions: buildOnboardingTrainingCompletions(trainings, onboardingPersonnelIds)
	};
}

function buildTrainingSummary(
	trainings: TrainingCompletionFacts[],
	personnel: Personnel[],
	trainingTypes: TrainingType[],
	asOf: string,
	options: TrainingSummaryInput['options'] = {}
): TrainingSummary {
	const { issueLimit = 5, issueStatuses = ['expired', 'warning-orange'], includeNotCompleted = false } = options;

	const stats = getTrainingStats(personnel, trainingTypes, trainings, options.groupId, asOf);

	const delinquent = getDelinquentTrainings(personnel, trainingTypes, trainings, {
		groupId: options.groupId,
		includeNotCompleted,
		asOf
	});

	// Literal person attribution uses the complete applicable result, independently
	// of the display-only issue filter and limit. Multiple requirements count once.
	const expiredPersonnel = new Set<string>();
	const expiredByType = new Map<string, ExpiredTrainingType>();
	const groups = new Map<string | null, { expired: Set<string>; delinquent: Set<string> }>();
	for (const { person, type, statusInfo } of delinquent) {
		if (statusInfo.status !== 'expired' && statusInfo.status !== 'warning-orange') continue;
		const groupId = person.groupId ?? null;
		let group = groups.get(groupId);
		if (!group) {
			group = { expired: new Set(), delinquent: new Set() };
			groups.set(groupId, group);
		}
		group.delinquent.add(person.id);
		if (statusInfo.status === 'expired') {
			expiredPersonnel.add(person.id);
			group.expired.add(person.id);
			const daysLate = -(statusInfo.daysUntilExpiration ?? 0);
			const expired = expiredByType.get(type.id);
			if (expired) {
				expired.personnelIds.push(person.id);
				expired.maxDaysLate = Math.max(expired.maxDaysLate, daysLate);
			} else {
				expiredByType.set(type.id, { trainingTypeId: type.id, personnelIds: [person.id], maxDaysLate: daysLate });
			}
		}
	}
	const filtered = delinquent.filter((d) => issueStatuses.includes(d.statusInfo.status));

	const issues: TrainingIssue[] = filtered.slice(0, issueLimit).map((d) => ({
		personnelId: d.person.id,
		personName: `${d.person.rank} ${d.person.lastName}, ${d.person.firstName}`,
		typeName: d.type.name,
		label: d.statusInfo.label,
		status: d.statusInfo.status,
		daysUntilExpiration: d.statusInfo.daysUntilExpiration
	}));

	return {
		stats,
		issues,
		expiredByType: [...expiredByType.values()],
		expiredPersonnelCount: expiredPersonnel.size,
		groupDelinquencies: Array.from(groups, ([groupId, group]) => ({
			groupId,
			expiredPersonnelCount: group.expired.size,
			delinquentPersonnelCount: group.delinquent.size
		}))
	};
}

function buildOnboardingTrainingCompletions(trainings: TrainingCompletionFacts[], personnelIds: string[]): Set<string> {
	if (personnelIds.length === 0) return new Set();

	const requestedIds = new Set(personnelIds);
	return new Set(
		trainings.filter((t) => requestedIds.has(t.personnelId)).map((t) => `${t.personnelId}-${t.trainingTypeId}`)
	);
}
