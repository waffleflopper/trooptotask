import { setupHasData } from '$features/organization/contracts';
import type { DashboardInputs } from './dashboardInputs';
import type { SetupCheck } from './dashboardSections';
import { orgPath } from './needsYouSources';

export function hasOnboardingTemplate(inputs: DashboardInputs): boolean {
	return (
		setupHasData.onboarding({ hasOnboardingTemplate: inputs.page.dashboard.data.hasAnyOnboardingTemplate }) === true
	);
}

export const onboardingSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.onboarding({ hasOnboardingTemplate: inputs.page.dashboard.data.hasAnyOnboardingTemplate }) === false,
	gap: 'there are no templates yet',
	fix: { label: 'Create a template', href: (inputs) => `${orgPath(inputs)}/onboarding/templates` }
};

export const trainingSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.training({ trainingTypeCount: inputs.page.dashboard.data.trainingTypes.length }) === false,
	gap: 'there are no training types yet',
	fix: { label: 'Add a training type', href: (inputs) => `${orgPath(inputs)}/training/types` }
};

/** A failed or withheld summary is unknown, not empty, so only a read that found no task counts. */
export const criticalTasksSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.criticalTasks({ hasActiveCriticalTasks: inputs.page.ictlSummary?.hasActiveTasks ?? null }) === false,
	gap: 'there are no active tasks yet',
	fix: { label: 'Add a task', href: (inputs) => `${orgPath(inputs)}/critical-tasks/library` }
};

export const evaluationsSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.evaluations({ ratingSchemeEntryCount: inputs.page.dashboard.data.ratingSchemeEntries.length }) ===
		false,
	gap: 'there are no rating scheme entries yet',
	fix: { label: 'Add an entry', href: (inputs) => `${orgPath(inputs)}/evals` }
};
