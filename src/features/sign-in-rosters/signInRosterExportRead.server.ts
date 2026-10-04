interface RawExportReadStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}

export function listSignInRosterExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('sign_in_rosters', orgId);
}
