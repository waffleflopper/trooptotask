import type { FeatureKey } from '$lib/access/featureSwitches';

export function trainingStepsAreManual(ctx: { readonly disabledFeatures: readonly FeatureKey[] }): boolean {
	return ctx.disabledFeatures.includes('training');
}

export function onboardingResponse<T extends { steps: Array<{ stepType: string }> }>(
	ctx: { readonly disabledFeatures: readonly FeatureKey[] },
	packet: T
): T {
	return {
		...packet,
		steps: packet.steps.map((step) => onboardingStepResponse(ctx, step))
	};
}

export function onboardingStepResponse<T extends { stepType: string }>(
	ctx: { readonly disabledFeatures: readonly FeatureKey[] },
	step: T
): T {
	return trainingStepsAreManual(ctx) && step.stepType === 'training' ? { ...step, stepType: 'checkbox' } : step;
}
