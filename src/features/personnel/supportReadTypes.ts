/** Active roster totals for an admitted platform support projection. */
export interface PersonnelSupportReader {
	countActivePersonnelByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelForOrganization(organizationId: string): Promise<number>;
}
