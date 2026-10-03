export interface CalendarSupportReader {
	countCatalogsByOrganization(
		organizationIds: string[]
	): Promise<{ statusTypes: Map<string, number>; assignmentTypes: Map<string, number> }>;
}
