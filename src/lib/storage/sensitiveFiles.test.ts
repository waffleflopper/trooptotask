import { describe, expect, it } from 'vitest';
import {
	SENSITIVE_FILE_ACCEPT,
	SENSITIVE_FILE_BUCKET,
	SENSITIVE_FILE_MAX_BYTES,
	buildSignInRosterScanFilePath,
	buildSensitiveFilePath,
	sanitizeSensitiveFilename,
	validateSensitiveFileSelection,
	validateSensitivePdfFile
} from './sensitiveFiles';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

describe('sensitiveFiles', () => {
	it('builds an org-scoped storage path with a sanitized filename', () => {
		expect(
			buildSensitiveFilePath({
				orgId: 'org-1',
				scope: 'sign-in-rosters',
				recordId: 'roster-1',
				filename: 'signed roster (final).pdf'
			})
		).toBe('org-1/sign-in-rosters/roster-1/signed_roster__final_.pdf');
	});

	it('builds unique sign-in roster scan paths for the same filename', () => {
		const first = buildSignInRosterScanFilePath({
			orgId: 'org-1',
			rosterId: 'roster-1',
			filename: 'signed roster.pdf'
		});
		const second = buildSignInRosterScanFilePath({
			orgId: 'org-1',
			rosterId: 'roster-1',
			filename: 'signed roster.pdf'
		});

		expect(first).not.toBe(second);
		expect(first).toMatch(/^org-1\/sign-in-rosters\/roster-1\/[0-9a-f-]{36}-signed_roster\.pdf$/);
		expect(second).toMatch(/^org-1\/sign-in-rosters\/roster-1\/[0-9a-f-]{36}-signed_roster\.pdf$/);
	});

	it('validates the default file constraints for sensitive uploads', () => {
		expect(SENSITIVE_FILE_BUCKET).toBe('counseling-files');
		expect(SENSITIVE_FILE_ACCEPT).toBe('application/pdf');
		expect(validateSensitiveFileSelection({ type: 'application/pdf', size: SENSITIVE_FILE_MAX_BYTES })).toBeNull();
		expect(validateSensitiveFileSelection({ type: 'image/png', size: 1024 })).toBe('Only PDF files are allowed.');
		expect(validateSensitiveFileSelection({ type: 'application/pdf', size: SENSITIVE_FILE_MAX_BYTES + 1 })).toBe(
			'File must be under 10MB.'
		);
	});

	it('rejects PDF uploads when the bytes do not match the PDF signature', async () => {
		const file = new File(['not a pdf'], 'spoofed.pdf', { type: 'application/pdf' });

		await expect(validateSensitivePdfFile(file)).resolves.toBe('Only PDF files are allowed.');
	});

	it('accepts PDF uploads when the bytes match the PDF signature', async () => {
		const file = new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' });

		await expect(validateSensitivePdfFile(file)).resolves.toBeNull();
	});

	it('sanitizes filenames consistently for storage-safe paths', () => {
		expect(sanitizeSensitiveFilename('../scan?.pdf')).toBe('.._scan_.pdf');
	});
});
