interface DataExportWriteStore {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>): Promise<T>;
}

interface DataExportReadStore {
	findMany<T>(table: string, orgId: string): Promise<T[]>;
}

export interface DataExportLifecyclePorts {
	auth: { readonly orgId: string };
	store: DataExportWriteStore;
}

interface DataExportRow {
	id: string;
}

async function updateDataExportStatusBestEffort(
	ports: DataExportLifecyclePorts,
	input: { exportId: string; patch: Record<string, unknown>; statusLabel: 'completed' | 'failed' }
): Promise<void> {
	try {
		await ports.store.update('data_exports', ports.auth.orgId, input.exportId, input.patch);
	} catch (error) {
		console.warn(`[data-exports] Failed to mark export ${input.exportId} as ${input.statusLabel}:`, error);
	}
}

export async function startDataExport(
	ports: DataExportLifecyclePorts,
	input: { requestedBy: string }
): Promise<{ exportId: string }> {
	const record = await ports.store.insert<DataExportRow>('data_exports', ports.auth.orgId, {
		requested_by: input.requestedBy,
		status: 'processing',
		created_at: new Date().toISOString()
	});

	return { exportId: record.id };
}

export async function completeDataExport(
	ports: DataExportLifecyclePorts,
	input: { exportId: string; fileSizeBytes: number }
): Promise<void> {
	await updateDataExportStatusBestEffort(ports, {
		exportId: input.exportId,
		patch: {
			status: 'completed',
			completed_at: new Date().toISOString(),
			file_size_bytes: input.fileSizeBytes
		},
		statusLabel: 'completed'
	});
}

export async function failDataExport(ports: DataExportLifecyclePorts, input: { exportId: string }): Promise<void> {
	await updateDataExportStatusBestEffort(ports, {
		exportId: input.exportId,
		patch: {
			status: 'failed',
			completed_at: new Date().toISOString()
		},
		statusLabel: 'failed'
	});
}

export function listDataExportRows(store: DataExportReadStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('data_exports', orgId);
}
