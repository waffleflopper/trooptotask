interface RawExportReadStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}

export function listCriticalTaskExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('ict_tasks', orgId);
}

export function listPersonnelCriticalTaskCompletionExportRows(
	store: RawExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel_ict_completions', orgId);
}
