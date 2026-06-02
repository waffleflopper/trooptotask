export const SENSITIVE_FILE_BUCKET = 'counseling-files';
export const SENSITIVE_FILE_ACCEPT = 'application/pdf';
export const SENSITIVE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export type SensitiveFileScope = 'sign-in-rosters' | 'counseling-records';

export function sanitizeSensitiveFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildSensitiveFilePath(input: {
	orgId: string;
	scope: SensitiveFileScope;
	recordId: string;
	filename: string;
}): string {
	return `${input.orgId}/${input.scope}/${input.recordId}/${sanitizeSensitiveFilename(input.filename)}`;
}

export function validateSensitiveFileSelection(file: { type: string; size: number }): string | null {
	if (file.type !== SENSITIVE_FILE_ACCEPT) {
		return 'Only PDF files are allowed.';
	}

	if (file.size > SENSITIVE_FILE_MAX_BYTES) {
		return 'File must be under 10MB.';
	}

	return null;
}
