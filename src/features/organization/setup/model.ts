import type { FeatureKey } from '$lib/access/featureSwitches';
import { SETUP_STEPS, type SetupFacts, type SetupStep } from './registry';
import type { OrganizationSetup } from './state';

export type SetupStepState = 'off' | 'done' | 'later' | 'notAnswered';

export function deriveSetupStepState(
	step: SetupStep,
	state: OrganizationSetup,
	facts: SetupFacts,
	disabledFeatures: readonly FeatureKey[]
): SetupStepState {
	if (step.featureSwitch && disabledFeatures.includes(step.featureSwitch)) return 'off';
	if (step.hasData({ ...facts, branch: state.branch }) || state.answers[step.key] === 'reviewed') return 'done';
	if (state.answers[step.key] === 'later') return 'later';
	return 'notAnswered';
}

export function buildSetupModel({
	state,
	facts,
	disabledFeatures,
	registry = SETUP_STEPS
}: {
	state: OrganizationSetup;
	facts: SetupFacts;
	disabledFeatures: readonly FeatureKey[];
	registry?: readonly SetupStep[];
}) {
	const steps = registry.map((entry) => {
		const { hasData: _hasData, factSources, ...step } = entry;
		return {
			...step,
			state: deriveSetupStepState(entry, state, facts, disabledFeatures),
			loadErrors: factSources.flatMap((source) => {
				const fact = facts[source];
				return fact.status === 'error' ? [{ source, message: fact.message }] : [];
			})
		};
	});
	const unanswered = steps.filter((step) => step.state === 'notAnswered');
	const features = steps.filter((step) => step.group === 'features');
	return {
		steps,
		on: features.filter((step) => step.state === 'done'),
		later: features.filter((step) => step.state === 'later'),
		off: features.filter((step) => step.state === 'off'),
		unanswered,
		reviewed: steps.length - unanswered.length,
		total: steps.length,
		firstUnansweredSlug: unanswered[0]?.slug ?? 'done'
	};
}
export type SetupModel = ReturnType<typeof buildSetupModel>;
