import type { Personnel } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

export interface CalendarWorkspaceData {
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
	advancedDutyEvents?: DutyEvent[];
}
