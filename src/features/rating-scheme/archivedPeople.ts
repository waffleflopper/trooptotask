/** Lowercased IDs of archived People, built once per request. */
export type ArchivedPersonIds = ReadonlySet<string>;

export function toArchivedPersonIds(ids: readonly string[]): ArchivedPersonIds {
	return new Set(ids.map((id) => id.toLowerCase()));
}

export function isArchivedPerson(archived: ArchivedPersonIds, personId: string): boolean {
	return archived.has(personId.toLowerCase());
}
