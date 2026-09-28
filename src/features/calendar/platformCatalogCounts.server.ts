type CalendarCatalogTable = 'status_types' | 'assignment_types';
type CountRows = (table: CalendarCatalogTable, organizationIds: string[]) => Promise<Map<string, number>>;

/** Calendar's setup counts for an already-authorized platform health scan. */
export async function countCalendarCatalogsByOrganization(
	organizationIds: string[],
	countRows: CountRows
): Promise<{ statusTypes: Map<string, number>; assignmentTypes: Map<string, number> }> {
	const [statusTypes, assignmentTypes] = await Promise.all([
		countRows('status_types', organizationIds),
		countRows('assignment_types', organizationIds)
	]);
	return { statusTypes, assignmentTypes };
}
