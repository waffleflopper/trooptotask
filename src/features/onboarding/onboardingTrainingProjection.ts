import type { PersonnelOnboarding } from './onboarding.types';

export function projectOnboardingTrainingSteps(
	packet: PersonnelOnboarding,
	isCompleted: (trainingTypeId: string) => boolean
): PersonnelOnboarding {
	return {
		...packet,
		steps: packet.steps.map((step) =>
			step.stepType === 'training' && step.active && step.trainingTypeId !== null
				? { ...step, completed: step.completed || isCompleted(step.trainingTypeId) }
				: step
		)
	};
}
