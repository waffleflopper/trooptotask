import type { SupabaseClient } from '$lib/server/database';

export interface DataExportLifecycleWriter {
	createProcessing(input: { requestedBy: string; createdAt: string }): Promise<{ exportId: string }>;
	markCompleted(input: { exportId: string; completedAt: string; fileSizeBytes: number }): Promise<void>;
	markFailed(input: { exportId: string; completedAt: string }): Promise<void>;
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
					status: 'processing',
					created_at: input.createdAt
				})
				.select('id')
				.single();
			if (error) throw new Error(error.message);
			return { exportId: acknowledgedExportId(data) };
		},
		async markCompleted(input) {
			const { data, error } = await client
				.from('data_exports')
				.update({
					status: 'completed',
					completed_at: input.completedAt,
					file_size_bytes: input.fileSizeBytes
				})
				.eq('org_id', orgId)
				.eq('id', input.exportId)
				.select('id')
				.single();
			if (error) throw new Error(error.message);
			acknowledgedExportId(data, input.exportId);
		},
		async markFailed(input) {
			const { data, error } = await client
				.from('data_exports')
				.update({ status: 'failed', completed_at: input.completedAt })
				.eq('org_id', orgId)
				.eq('id', input.exportId)
				.select('id')
				.single();
			if (error) throw new Error(error.message);
			acknowledgedExportId(data, input.exportId);
		}
	};
}
