interface RawExportReadStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}

export function listGroupExportRows(store: RawExportReadStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('groups', orgId);
}

export function listPersonnelExportRows(store: RawExportReadStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel', orgId);
}

export function listOrganizationRankCatalogExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('organization_rank_catalog', orgId);
}

export function listUserPinnedGroupExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('user_pinned_groups', orgId);
}
