import type { AuthContext, DataStore } from '$lib/server/core/ports';

interface DataExportLifecyclePorts {
	auth: Pick<AuthContext, 'orgId'>;
	store: DataStore;
}

interface DataExportRow {
	id: string;
}

export async function startDataExport(
	ports: DataExportLifecyclePorts,
	input: { requestedBy: string }
): Promise<{ exportId: string }> {
	const record = await ports.store.insert<DataExportRow>('data_exports', ports.auth.orgId, {
		requested_by: input.requestedBy,
		status: 'processing'
	});

	return { exportId: record.id };
}

export async function completeDataExport(
	ports: DataExportLifecyclePorts,
	input: { exportId: string; fileSizeBytes: number }
): Promise<void> {
	await ports.store.update('data_exports', ports.auth.orgId, input.exportId, {
		status: 'completed',
		completed_at: new Date().toISOString(),
		file_size_bytes: input.fileSizeBytes
	});
}

export async function failDataExport(ports: DataExportLifecyclePorts, input: { exportId: string }): Promise<void> {
	await ports.store.update('data_exports', ports.auth.orgId, input.exportId, {
		status: 'failed',
		completed_at: new Date().toISOString()
	});
}
