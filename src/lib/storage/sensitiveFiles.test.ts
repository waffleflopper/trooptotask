import { describe, expect, it } from 'vitest';
import {
	SENSITIVE_FILE_ACCEPT,
	SENSITIVE_FILE_BUCKET,
	SENSITIVE_FILE_MAX_BYTES,
	buildSensitiveFilePath,
	sanitizeSensitiveFilename,
	validateSensitiveFileSelection
} from './sensitiveFiles';

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

	it('validates the default file constraints for sensitive uploads', () => {
		expect(SENSITIVE_FILE_BUCKET).toBe('counseling-files');
		expect(SENSITIVE_FILE_ACCEPT).toBe('application/pdf');
		expect(validateSensitiveFileSelection({ type: 'application/pdf', size: SENSITIVE_FILE_MAX_BYTES })).toBeNull();
		expect(validateSensitiveFileSelection({ type: 'image/png', size: 1024 })).toBe('Only PDF files are allowed.');
		expect(validateSensitiveFileSelection({ type: 'application/pdf', size: SENSITIVE_FILE_MAX_BYTES + 1 })).toBe(
			'File must be under 10MB.'
		);
	});

	it('sanitizes filenames consistently for storage-safe paths', () => {
		expect(sanitizeSensitiveFilename('../scan?.pdf')).toBe('.._scan_.pdf');
	});
});
