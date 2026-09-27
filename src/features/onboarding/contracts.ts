/** Only the active Personnel IDs needed for Calendar's onboarding markers. */
export interface OnboardingCalendarMarkersPort {
	listActivePersonnelIds(orgId: string): Promise<string[]>;
}
