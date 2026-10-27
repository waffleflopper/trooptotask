export interface SetupDataFacts {
	trainingTypeCount: number | null;
	hasActiveCriticalTasks: boolean | null;
	ratingSchemeEntryCount: number | null;
	hasOnboardingTemplate: boolean | null;
}

function hasRows(count: number | null): boolean | null {
	return count === null ? null : count > 0;
}

// Unknown sources must not become empty-feature reminders.
export const setupHasData = {
	training: (facts: Pick<SetupDataFacts, 'trainingTypeCount'>) => hasRows(facts.trainingTypeCount),
	criticalTasks: (facts: Pick<SetupDataFacts, 'hasActiveCriticalTasks'>) => facts.hasActiveCriticalTasks,
	evaluations: (facts: Pick<SetupDataFacts, 'ratingSchemeEntryCount'>) => hasRows(facts.ratingSchemeEntryCount),
	onboarding: (facts: Pick<SetupDataFacts, 'hasOnboardingTemplate'>) => facts.hasOnboardingTemplate
};
