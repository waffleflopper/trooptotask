import type { ArchivePersonnelBatchResult } from '../contracts';

export async function bulkArchivePersonnel(orgId: string, ids: string[]): Promise<ArchivePersonnelBatchResult> {
	const response = await fetch(`/org/${orgId}/api/personnel/archive-batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	if (!response.ok) throw new Error('Archive result could not be confirmed');

	const result: unknown = await response.json();
	if (!result || typeof result !== 'object') throw new Error('Archive result could not be confirmed');
	const { archivedIds, approvalRequestedIds, errors } = result as Partial<ArchivePersonnelBatchResult>;
	if (
		!Array.isArray(archivedIds) ||
		!archivedIds.every((id) => typeof id === 'string') ||
		!Array.isArray(approvalRequestedIds) ||
		!approvalRequestedIds.every((id) => typeof id === 'string') ||
		!Array.isArray(errors) ||
		!errors.every((error) => error && typeof error.id === 'string' && typeof error.message === 'string')
	)
		throw new Error('Archive result could not be confirmed');
	const reportedIds = [...archivedIds, ...approvalRequestedIds, ...errors.map((error) => error.id)];
	const selectedIds = new Set(ids);
	if (
		reportedIds.length !== ids.length ||
		new Set(reportedIds).size !== ids.length ||
		reportedIds.some((id) => !selectedIds.has(id))
	) {
		throw new Error('Archive result could not be confirmed');
	}
	return { archivedIds, approvalRequestedIds, errors };
}
