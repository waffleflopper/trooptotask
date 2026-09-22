import type { Personnel } from '$lib/types';

export interface CalendarWorkspaceData {
	rangeStart?: string;
	rangeEnd?: string;
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays?: number;
}
