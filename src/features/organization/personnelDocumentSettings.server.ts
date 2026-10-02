export interface OrganizationPersonnelDocumentSettingsReader {
	findStorageCapBytes(orgId: string): Promise<number | null | undefined>;
}

/** An admitted artifact write reads this Organization's per-Person storage setting. */
export async function loadPersonnelDocumentStorageCapBytes(
	reader: OrganizationPersonnelDocumentSettingsReader,
	orgId: string
): Promise<number> {
	return (await reader.findStorageCapBytes(orgId)) ?? 100 * 1024 * 1024;
}
