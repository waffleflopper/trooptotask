export interface ArchivePersonnelBatchResult {
	archivedIds: string[];
	approvalRequestedIds: string[];
	errors: Array<{ id: string; message: string }>;
	/** Takes back exactly what this call archived and requested, for a short while. Absent when it did neither. */
	undo?: string;
}
