import { describe, expect, it } from 'vitest';
import { checkUploadFile, uploadIntentFromSearch } from './fileUploadRules';

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('upload file check', () => {
	it('lets a PDF become a counseling or a document', () => {
		expect(checkUploadFile(file('da4856.pdf', 'application/pdf', 1000))).toEqual({
			ok: true,
			type: 'application/pdf',
			kinds: ['counseling', 'document']
		});
	});

	it('lets an image become a document only', () => {
		for (const [name, type] of [
			['card.jpg', 'image/jpeg'],
			['scan.png', 'image/png'],
			['photo.heic', 'image/heic']
		])
			expect(checkUploadFile(file(name, type, 1000))).toMatchObject({ ok: true, kinds: ['document'] });
	});

	it('reads an untyped HEIC from its extension but not an untyped unknown file', () => {
		expect(checkUploadFile(file('IMG_0042.HEIC', '', 1000))).toEqual({
			ok: true,
			type: 'image/heic',
			kinds: ['document']
		});
		expect(checkUploadFile(file('notes.txt', '', 1000))).toEqual({
			ok: false,
			message: "notes.txt isn't a PDF, JPG, PNG or HEIC file."
		});
	});

	it('trusts a declared type over a misleading extension', () => {
		expect(checkUploadFile(file('renamed.pdf', 'text/plain', 1000))).toMatchObject({ ok: false });
	});

	it('accepts a file of exactly 10 MB and rejects one byte over, naming the file and the limit', () => {
		expect(checkUploadFile(file('edge.pdf', 'application/pdf', 10_485_760))).toMatchObject({ ok: true });

		const over = checkUploadFile(file('big.pdf', 'application/pdf', 10_485_761));

		expect(over.ok).toBe(false);
		expect(over).toMatchObject({ message: expect.stringMatching(/big\.pdf.*10 MB/) });
	});

	it('rejects an empty file', () => {
		expect(checkUploadFile(file('empty.pdf', 'application/pdf', 0))).toEqual({
			ok: false,
			message: 'empty.pdf is empty.'
		});
	});
});

describe('upload intent', () => {
	it('reads the two kinds from ?add= and ignores anything else', () => {
		expect(uploadIntentFromSearch(new URLSearchParams('add=counseling'))).toBe('counseling');
		expect(uploadIntentFromSearch(new URLSearchParams('add=document&x=1'))).toBe('document');
		expect(uploadIntentFromSearch(new URLSearchParams('add=note'))).toBeNull();
		expect(uploadIntentFromSearch(new URLSearchParams(''))).toBeNull();
	});
});
