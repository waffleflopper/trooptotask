interface RawExportReadStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}

export function listGettingStartedProgressExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('getting_started_progress', orgId);
}

export function listUserOrgPreferenceExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('user_org_preferences', orgId);
}
