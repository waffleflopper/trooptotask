import type { Personnel } from '$lib/types';

export interface CalendarWorkspaceData {
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
}
