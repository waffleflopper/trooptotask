import { FEATURE_SETUP, setupHasData } from '$features/organization/contracts';
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
	fix: {
		label: FEATURE_SETUP.onboarding.fix.label,
		href: (inputs) => `${orgPath(inputs)}/${FEATURE_SETUP.onboarding.fix.path}`
	}
};

export const trainingSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.training({
			trainingTypeCount: inputs.page.dashboard.data.trainingTypes.filter((type) => !type.archivedAt).length
		}) === false,
	gap: 'there are no training types yet',
	fix: {
		label: FEATURE_SETUP.training.fix.label,
		href: (inputs) => `${orgPath(inputs)}/${FEATURE_SETUP.training.fix.path}`
	}
};

/** A failed or withheld summary is unknown, not empty, so only a read that found no task counts. */
export const criticalTasksSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.criticalTasks({ hasActiveCriticalTasks: inputs.page.ictlSummary?.hasActiveTasks ?? null }) === false,
	gap: 'there are no active tasks yet',
	fix: {
		label: FEATURE_SETUP.criticalTasks.fix.label,
		href: (inputs) => `${orgPath(inputs)}/${FEATURE_SETUP.criticalTasks.fix.path}`
	}
};

export const evaluationsSetup: SetupCheck = {
	isNotSetUp: (inputs) =>
		setupHasData.evaluations({ ratingSchemeEntryCount: inputs.page.dashboard.data.ratingSchemeEntries.length }) ===
		false,
	gap: 'there are no rating scheme entries yet',
	fix: {
		label: FEATURE_SETUP.evaluations.fix.label,
		href: (inputs) => `${orgPath(inputs)}/${FEATURE_SETUP.evaluations.fix.path}`
	}
};
