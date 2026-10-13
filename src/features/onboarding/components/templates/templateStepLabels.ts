import type { OnboardingStepType } from '../../contracts';

export const STEP_TYPE_LABELS: Record<OnboardingStepType, string> = {
	checkbox: 'Checkbox',
	paperwork: 'Paperwork',
	training: 'Training'
};

export const STEP_TYPES: OnboardingStepType[] = ['checkbox', 'paperwork', 'training'];

export function stepPosition(index: number): string {
	return String(index + 1).padStart(2, '0');
}
