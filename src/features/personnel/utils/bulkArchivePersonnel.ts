export interface BulkArchivePersonnelResult {
	archivedIds: string[];
	approvalRequestedIds: string[];
	errors: Array<{ id: string; message: string }>;
}

export async function bulkArchivePersonnel(orgId: string, ids: string[]): Promise<BulkArchivePersonnelResult> {
	const response = await fetch(`/org/${orgId}/api/personnel/archive-batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});

	if (!response.ok) {
		return {
			archivedIds: [],
			approvalRequestedIds: [],
			errors: ids.map((id) => ({ id, message: 'Failed to archive personnel' }))
		};
	}

	return response.json();
}
