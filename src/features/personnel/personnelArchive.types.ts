export interface ArchivePersonnelBatchResult {
	archivedIds: string[];
	approvalRequestedIds: string[];
	errors: Array<{ id: string; message: string }>;
}
