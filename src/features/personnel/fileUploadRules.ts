export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type UploadKind = 'counseling' | 'document';

const TYPE_BY_EXTENSION: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	heic: 'image/heic',
	heif: 'image/heif'
};
const ACCEPTED_TYPES = new Set(Object.values(TYPE_BY_EXTENSION));

/** The picker filter: browsers that give HEIC no type still list it by extension. */
export const UPLOAD_ACCEPT = [...ACCEPTED_TYPES, ...Object.keys(TYPE_BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

export type UploadCheck = { ok: true; type: string; kinds: UploadKind[] } | { ok: false; message: string };

/** The accepted media type a file declares, falling back to its extension only when the browser gave none. */
function declaredType(file: Pick<File, 'name' | 'type'>): string | null {
	if (file.type) return ACCEPTED_TYPES.has(file.type) ? file.type : null;
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return TYPE_BY_EXTENSION[extension] ?? null;
}

/** What a file may become, decided before any upload: counselings are PDF only, documents take all four types. */
export function checkUploadFile(file: Pick<File, 'name' | 'type' | 'size'>): UploadCheck {
	const type = declaredType(file);
	if (!type) return { ok: false, message: `${file.name} isn't a PDF, JPG, PNG or HEIC file.` };
	if (file.size === 0) return { ok: false, message: `${file.name} is empty.` };
	if (file.size > UPLOAD_MAX_BYTES) return { ok: false, message: `${file.name} is over the 10 MB limit.` };
	return { ok: true, type, kinds: type === 'application/pdf' ? ['counseling', 'document'] : ['document'] };
}

/** The same bytes carrying the type the server checks, for browsers that leave HEIC untyped. */
export function withDeclaredType(file: File, type: string): File {
	return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

/** `?add=counseling` or `?add=document` names the kind the upload flow opens with. */
export function uploadIntentFromSearch(params: URLSearchParams): UploadKind | null {
	const add = params.get('add');
	return add === 'counseling' || add === 'document' ? add : null;
}
