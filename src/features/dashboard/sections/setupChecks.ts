import type { DashboardInputs } from './dashboardInputs';
import type { SetupCheck } from './dashboardSections';
import { orgPath } from './needsYouSources';

export function hasOnboardingTemplate(inputs: DashboardInputs): boolean {
	return inputs.page.dashboard.data.hasAnyOnboardingTemplate;
}

export const onboardingSetup: SetupCheck = {
	isNotSetUp: (inputs) => !hasOnboardingTemplate(inputs),
	gap: 'there are no templates yet',
	fix: { label: 'Create a template', href: (inputs) => `${orgPath(inputs)}/onboarding/templates` }
};

export const trainingSetup: SetupCheck = {
	isNotSetUp: (inputs) => inputs.page.dashboard.data.trainingTypes.length === 0,
	gap: 'there are no training types yet',
	fix: { label: 'Add a training type', href: (inputs) => `${orgPath(inputs)}/training/types` }
};

/** A failed or withheld summary is unknown, not empty, so only a read that found no task counts. */
export const criticalTasksSetup: SetupCheck = {
	isNotSetUp: (inputs) => inputs.page.ictlSummary?.hasActiveTasks === false,
	gap: 'there are no active tasks yet',
	fix: { label: 'Add a task', href: (inputs) => `${orgPath(inputs)}/critical-tasks/library` }
};

export const evaluationsSetup: SetupCheck = {
	isNotSetUp: (inputs) => inputs.page.dashboard.data.ratingSchemeEntries.length === 0,
	gap: 'there are no rating scheme entries yet',
	fix: { label: 'Add an entry', href: (inputs) => `${orgPath(inputs)}/evals` }
};
