import { describe, expect, it } from 'vitest';
import { hasPdfFileSignature } from './fileSignatures';

describe('file signature detection', () => {
	it('detects bytes with a PDF file signature', () => {
		expect(hasPdfFileSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
	});

	it('rejects bytes without a PDF file signature', () => {
		expect(hasPdfFileSignature(new Uint8Array([0x50, 0x44, 0x46, 0x2d]))).toBe(false);
		expect(hasPdfFileSignature(new Uint8Array())).toBe(false);
	});
});
