import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { DashboardPageData } from '../contracts';

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
