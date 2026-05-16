import { describe, expect, it } from 'vitest';
import { derivePersonnelDocumentTitle } from './documentTitles';

describe('personnel document title derivation', () => {
	it('uses an explicit title when provided', () => {
		expect(derivePersonnelDocumentTitle({ title: '  Updated BLS Card  ', filename: 'bls-card.png' })).toBe(
			'Updated BLS Card'
		);
	});

	it('derives a fallback title from the filename', () => {
		expect(derivePersonnelDocumentTitle({ filename: 'inspection-worksheet_2026.pdf' })).toBe(
			'inspection worksheet 2026'
		);
	});

	it('uses the default fallback when title and filename are blank', () => {
		expect(derivePersonnelDocumentTitle({ title: ' ', filename: '///' })).toBe('Uploaded document');
	});
});
