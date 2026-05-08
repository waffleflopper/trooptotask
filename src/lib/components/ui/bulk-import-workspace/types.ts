export type BulkImportRowStatusTone = 'valid' | 'warning' | 'error' | 'disabled' | 'duplicate' | 'info';

export type BulkImportRowStatus = {
	tone: BulkImportRowStatusTone;
	label?: string;
	description?: string;
};
