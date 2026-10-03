/** Saved setup totals for an admitted platform support scan. */
export interface TrainingSupportReader {
	countTrainingTypesByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
}
