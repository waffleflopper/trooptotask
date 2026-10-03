/** Saved setup totals for an admitted platform support scan. */
export interface RatingSchemeSupportReader {
	countEntriesByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
}
