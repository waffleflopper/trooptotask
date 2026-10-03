import type { PersonnelOnboarding } from './onboarding.types';

/** Saved/server-derived progress includes only current packet work. */
export function getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
	let completed = 0;
	let total = 0;
	for (const step of onboarding.steps) {
		if (!step.active) continue;
		total++;
		if (step.completed) completed++;
	}
	return { completed, total };
}
