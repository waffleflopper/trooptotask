import type { AuthContext, DataStore } from '$lib/server/core/ports';

interface DataExportLifecyclePorts {
	auth: Pick<AuthContext, 'orgId'>;
	store: DataStore;
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
