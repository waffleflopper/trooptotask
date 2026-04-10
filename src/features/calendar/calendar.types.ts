import type { Personnel } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

export interface CalendarWorkspaceData {
	rangeStart?: string;
	rangeEnd?: string;
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
	advancedDutyEvents?: DutyEvent[];
}
