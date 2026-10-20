import { hasPdfFileSignature } from './fileSignatures';

export const PDF_OR_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

// HEIF is an ISO base media file: an `ftyp` box at bytes 4–7, then the brand at 8–11.
const hasHeicSignature = (bytes: Uint8Array) =>
	bytes.length >= 12 &&
	String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' &&
	['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(String.fromCharCode(...bytes.slice(8, 12)));

/** Each accepted media type and the leading bytes that prove a file really is one. */
const SIGNATURES = {
	'application/pdf': hasPdfFileSignature,
	'image/jpeg': (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	'image/png': (bytes: Uint8Array) =>
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte),
	'image/heic': hasHeicSignature,
	'image/heif': hasHeicSignature
} satisfies Record<string, (bytes: Uint8Array) => boolean>;

export type PdfOrPhotoType = keyof typeof SIGNATURES;

const TYPE_BY_EXTENSION: Record<string, PdfOrPhotoType> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	heic: 'image/heic',
	heif: 'image/heif'
};

export function isPdfOrPhotoType(type: string): type is PdfOrPhotoType {
	return Object.hasOwn(SIGNATURES, type);
}

/** The picker filter: browsers that give HEIC no type still list it by extension. */
export const PDF_OR_PHOTO_ACCEPT = [
	...Object.keys(SIGNATURES),
	...Object.keys(TYPE_BY_EXTENSION).map((extension) => `.${extension}`)
].join(',');

/** The accepted media type a file declares, falling back to its extension only when the browser gave none. */
export function declaredPdfOrPhotoType(file: Pick<File, 'name' | 'type'>): PdfOrPhotoType | null {
	if (file.type) return isPdfOrPhotoType(file.type) ? file.type : null;
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return TYPE_BY_EXTENSION[extension] ?? null;
}

/** The same bytes carrying the type the server checks, for browsers that leave HEIC untyped. */
export function withDeclaredType(file: File, type: string): File {
	return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

export type PdfOrPhotoProblem = 'type' | 'size' | 'contents';

/** Server check for an uploaded PDF or photo; each owner words the problem for its own file. */
export async function pdfOrPhotoFileProblem(file: File): Promise<PdfOrPhotoProblem | null> {
	if (!isPdfOrPhotoType(file.type)) return 'type';
	if (file.size > PDF_OR_PHOTO_MAX_BYTES) return 'size';
	const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	return SIGNATURES[file.type](bytes) ? null : 'contents';
}
