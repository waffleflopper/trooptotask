import { describe, expect, it } from 'vitest';
import { declaredPdfOrPhotoType, withDeclaredType } from './pdfOrPhotoFiles';

describe('declared PDF or photo type', () => {
	it('reads an untyped HEIC by its extension and refuses an untyped text file', () => {
		expect(declaredPdfOrPhotoType({ name: 'IMG_1.HEIC', type: '' })).toBe('image/heic');
		expect(declaredPdfOrPhotoType({ name: 'notes.txt', type: '' })).toBeNull();
	});

	it('trusts the browser type over the extension', () => {
		expect(declaredPdfOrPhotoType({ name: 'scan.pdf', type: 'image/png' })).toBe('image/png');
		expect(declaredPdfOrPhotoType({ name: 'scan.png', type: 'text/plain' })).toBeNull();
	});

	it('gives an untyped file the type its extension names and keeps its name and bytes', async () => {
		const untyped = withDeclaredType(new File(['abc'], 'IMG_1.heic'), 'image/heic');

		expect([untyped.type, untyped.name, await untyped.text()]).toEqual(['image/heic', 'IMG_1.heic', 'abc']);
	});
});
