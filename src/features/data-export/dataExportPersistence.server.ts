import type { SupabaseClient } from '$lib/server/database';

export interface DataExportLifecycleWriter {
	createProcessing(input: { requestedBy: string; createdAt: string }): Promise<{ exportId: string }>;
	markCompleted(input: { exportId: string; fileSizeBytes: number }): Promise<void>;
	markFailed(input: { exportId: string }): Promise<void>;
}

function acknowledgedExportId(data: unknown, expectedId?: string): string {
	if (
		!data ||
		typeof data !== 'object' ||
		Array.isArray(data) ||
		!('id' in data) ||
		typeof data.id !== 'string' ||
		data.id.length === 0 ||
		(expectedId !== undefined && data.id !== expectedId)
	) {
		throw new Error('Data export write returned an invalid acknowledgment');
	}
	return data.id;
}

export function createSupabaseDataExportLifecycleWriter(
	client: SupabaseClient,
	orgId: string
): DataExportLifecycleWriter {
	return {
		async createProcessing(input) {
			const { data, error } = await client
				.from('data_exports')
				.insert({
					org_id: orgId,
					requested_by: input.requestedBy,
					created_at: input.createdAt
				})
				.select('id')
				.single();
			if (error) throw new Error(error.message);
			return { exportId: acknowledgedExportId(data) };
		},
		async markCompleted(input) {
			const { data, error } = await client
				.rpc('finish_data_export', {
					p_organization_id: orgId,
					p_export_id: input.exportId,
					p_status: 'completed',
					p_file_size_bytes: input.fileSizeBytes
				})
				.single();
			if (error) throw new Error(error.message);
			acknowledgedExportId(data, input.exportId);
		},
		async markFailed(input) {
			const { data, error } = await client
				.rpc('finish_data_export', {
					p_organization_id: orgId,
					p_export_id: input.exportId,
					p_status: 'failed'
				})
				.single();
			if (error) throw new Error(error.message);
			acknowledgedExportId(data, input.exportId);
		}
	};
}
