export type BulkImportRowStatusTone = 'valid' | 'warning' | 'error' | 'disabled' | 'duplicate' | 'info';
export type BulkImportRowStatusDescriptionMode = 'inline' | 'sr-only';
export type BulkImportPreviewCellPresentation = 'default' | 'editable-grid';

export type BulkImportRowStatus = {
	tone: BulkImportRowStatusTone;
	label?: string;
	description?: string;
};
