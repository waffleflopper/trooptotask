import type { AvailabilityEntry } from '$features/calendar/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { DashboardPageData } from '../contracts';

export interface TodayAvailability {
	byPersonnelId: ReadonlyMap<string, AvailabilityEntry>;
}

export function indexTodayAvailability(
	availability: readonly AvailabilityEntry[],
	today: string,
	rosterById: ReadonlyMap<string, Personnel>
): TodayAvailability {
	const byPersonnelId = new Map<string, AvailabilityEntry>();
	for (const entry of availability) {
		if (entry.startDate > today || entry.endDate < today || !rosterById.has(entry.personnelId)) continue;
		if (!byPersonnelId.has(entry.personnelId)) byPersonnelId.set(entry.personnelId, entry);
	}
	return { byPersonnelId };
}

export function indexById<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
	return new Map(items.map((item) => [item.id, item]));
}

export function groupPersonnelByGroupId(personnel: readonly Personnel[]): ReadonlyMap<string | null, Personnel[]> {
	const byGroupId = new Map<string | null, Personnel[]>();
	for (const person of personnel) {
		const groupPersonnel = byGroupId.get(person.groupId);
		if (groupPersonnel) groupPersonnel.push(person);
		else byGroupId.set(person.groupId, [person]);
	}
	return byGroupId;
}

/**
 * Projects each active Training step from current Training records, so a step counts as done only
 * while a completion covers it. Without the Training summary the saved step snapshot stands.
 */
export function projectTrainingSteps(
	page: Pick<DashboardPageData, 'trainingSummary' | 'onboardingTrainingCompletions'>
): (packet: PersonnelOnboarding) => PersonnelOnboarding {
	if (!page.trainingSummary) return (packet) => packet;
	const completions = new Set(page.onboardingTrainingCompletions);
	return (packet) => ({
		...packet,
		steps: packet.steps.map((step) =>
			step.active && step.stepType === 'training' && step.trainingTypeId
				? { ...step, completed: completions.has(`${packet.personnelId}-${step.trainingTypeId}`) }
				: step
		)
	});
}
