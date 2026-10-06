import type { DataExportLifecycleWriter } from './dataExportPersistence.server';

export interface DataExportLifecyclePorts {
	exportLifecycle: DataExportLifecycleWriter;
}

async function updateDataExportStatusBestEffort(input: {
	exportId: string;
	update: () => Promise<void>;
	statusLabel: 'completed' | 'failed';
}): Promise<void> {
	try {
		await input.update();
	} catch (error) {
		console.warn(`[data-exports] Failed to mark export ${input.exportId} as ${input.statusLabel}:`, error);
	}
}

export async function startDataExport(
	ports: DataExportLifecyclePorts,
	input: { requestedBy: string }
): Promise<{ exportId: string }> {
	return ports.exportLifecycle.createProcessing({
		requestedBy: input.requestedBy,
		createdAt: new Date().toISOString()
	});
}

export async function completeDataExport(
	ports: DataExportLifecyclePorts,
	input: { exportId: string; fileSizeBytes: number }
): Promise<void> {
	await updateDataExportStatusBestEffort({
		exportId: input.exportId,
		update: () =>
			ports.exportLifecycle.markCompleted({
				exportId: input.exportId,
				completedAt: new Date().toISOString(),
				fileSizeBytes: input.fileSizeBytes
			}),
		statusLabel: 'completed'
	});
}

export async function failDataExport(ports: DataExportLifecyclePorts, input: { exportId: string }): Promise<void> {
	await updateDataExportStatusBestEffort({
		exportId: input.exportId,
		update: () => ports.exportLifecycle.markFailed({ exportId: input.exportId, completedAt: new Date().toISOString() }),
		statusLabel: 'failed'
	});
}
