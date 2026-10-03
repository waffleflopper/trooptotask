interface DashboardConfigExportStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}
/** Ordinary request-store export under Data Export's unchanged admission and RLS. */
export function listDashboardConfigExportRows(
	store: DashboardConfigExportStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('dashboard_configs', orgId);
}
