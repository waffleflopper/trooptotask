/** Saved setup totals for an admitted platform support scan. */
export interface OnboardingSupportReader {
	countTemplateStepsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
}
