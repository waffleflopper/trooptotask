import { hasPdfFileSignature } from './fileSignatures';

export const SENSITIVE_FILE_BUCKET = 'counseling-files';
export const SENSITIVE_FILE_ACCEPT = 'application/pdf';
export const SENSITIVE_FILE_MAX_BYTES = 10 * 1024 * 1024;
const PDF_SIGNATURE_BYTE_LENGTH = 4;

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

export function buildSignInRosterScanFilePath(input: { orgId: string; rosterId: string; filename: string }): string {
	return buildSensitiveFilePath({
		orgId: input.orgId,
		scope: 'sign-in-rosters',
		recordId: input.rosterId,
		filename: `${crypto.randomUUID()}-${sanitizeSensitiveFilename(input.filename)}`
	});
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

export async function validateSensitivePdfFile(file: File): Promise<string | null> {
	const validationError = validateSensitiveFileSelection(file);
	if (validationError) return validationError;

	const bytes = new Uint8Array(await file.slice(0, PDF_SIGNATURE_BYTE_LENGTH).arrayBuffer());
	if (!hasPdfFileSignature(bytes)) return 'Only PDF files are allowed.';

	return null;
}
