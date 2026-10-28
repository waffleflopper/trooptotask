import type { FeatureKey } from '$lib/access/featureSwitches';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { SETUP_STEPS, type SetupStep, type SetupStepKey } from './registry';
import type { OrganizationSetup, SetupPromptState } from './state';
import type { SetupModel } from './model';

export interface SetupEntry {
	prompt: { kind: 'invitation' } | { kind: 'newFeature'; step: SetupStepKey } | null;
	resume: { kind: 'setup' } | { kind: 'newFeature'; step: SetupStepKey } | null;
}

export interface SetupEntryData {
	orgId: string;
	state: OrganizationSetup;
	today: string;
	entry: SetupEntry;
}

export interface SetupInvitationProgress {
	orgId: string;
	handled: number;
	total: number;
	handledSteps: SetupModel['steps'];
	loadErrors: SetupModel['steps'][number]['loadErrors'];
}

export type SetupPromptChoice = 'tomorrow' | 'never';

export function setupPromptStateForChoice(choice: SetupPromptChoice, today: string): SetupPromptState {
	return choice === 'never' ? { never: true } : { snoozedUntil: fromDayNumber(toDayNumber(today) + 1) };
}

function isSnoozed(prompt: SetupPromptState | undefined, today: string) {
	return prompt !== undefined && 'snoozedUntil' in prompt && prompt.snoozedUntil > today;
}

export function setupEntry({
	isOwner,
	state,
	registry = SETUP_STEPS,
	disabledFeatures,
	organizationCreatedOn,
	today
}: {
	isOwner: boolean;
	state: OrganizationSetup;
	registry?: readonly SetupStep[];
	disabledFeatures: readonly FeatureKey[];
	organizationCreatedOn: string;
	today: string;
}): SetupEntry {
	if (!isOwner) return { prompt: null, resume: null };
	const setupPrompt = state.prompts.setup;
	const neverSetup = setupPrompt !== undefined && 'never' in setupPrompt;
	const newSteps = registry.filter((step) => {
		const prompt = state.prompts[step.key];
		return (
			step.since !== undefined &&
			step.since > organizationCreatedOn &&
			state.answers[step.key] === undefined &&
			!(step.featureSwitch && disabledFeatures.includes(step.featureSwitch)) &&
			!(prompt && 'never' in prompt)
		);
	});
	const newPrompt = newSteps.find((step) => !isSnoozed(state.prompts[step.key], today));
	const resumeStep = newSteps.find((step) => {
		const prompt = state.prompts[step.key];
		return neverSetup || (prompt !== undefined && 'snoozedUntil' in prompt);
	});
	const resume: SetupEntry['resume'] =
		!state.finishedAt && setupPrompt !== undefined && 'snoozedUntil' in setupPrompt
			? { kind: 'setup' }
			: resumeStep
				? { kind: 'newFeature', step: resumeStep.key }
				: null;
	if (!state.finishedAt && !neverSetup && !isSnoozed(setupPrompt, today)) {
		return { prompt: { kind: 'invitation' }, resume };
	}
	return {
		prompt: !neverSetup && newPrompt ? { kind: 'newFeature', step: newPrompt.key } : null,
		resume
	};
}
