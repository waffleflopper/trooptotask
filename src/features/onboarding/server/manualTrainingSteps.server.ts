import type { FeatureKey } from '$lib/access/featureSwitches';

/** While Training is off, Onboarding reads no Training records, so its Training steps are completed by hand. */
export function trainingStepsAreManual(ctx: { readonly disabledFeatures: readonly FeatureKey[] }): boolean {
	return ctx.disabledFeatures.includes('training');
}

/** Presents Training steps as the checkboxes they behave as while Training is off. */
export function asManualTrainingSteps<T extends { stepType: string }>(steps: T[]): T[] {
	return steps.map((step) => (step.stepType === 'training' ? { ...step, stepType: 'checkbox' } : step));
}
