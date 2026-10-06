import type { DashboardSetupSupport, StarterConfigurationPackSupport } from './contracts';

/** Delivery binds the admitted request's existing source-owner reads. */
export interface DashboardSetupSupportReader {
	countTrainingTypes(): Promise<number>;
	countOnboardingTemplateSteps(): Promise<number>;
	countRatingSchemeEntries(): Promise<number>;
	countOrganizationMembers(): Promise<number>;
	listStarterConfigurationPacks(): Promise<StarterConfigurationPackSupport[]>;
}

export async function fetchDashboardSetupSupport(reader: DashboardSetupSupportReader): Promise<DashboardSetupSupport> {
	const [
		trainingTypeCount,
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		starterConfigurationPacks
	] = await Promise.all([
		reader.countTrainingTypes(),
		reader.countOnboardingTemplateSteps(),
		reader.countRatingSchemeEntries(),
		reader.countOrganizationMembers(),
		reader.listStarterConfigurationPacks()
	]);
	return {
		trainingTypeCount,
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		starterConfigurationPacks
	};
}
