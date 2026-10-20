import { PDF_OR_PHOTO_MAX_BYTES, declaredPdfOrPhotoType } from '$lib/storage/pdfOrPhotoFiles';

export type UploadKind = 'counseling' | 'document';

export type UploadCheck = { ok: true; type: string; kinds: UploadKind[] } | { ok: false; message: string };

/** What a file may become, decided before any upload: counselings are PDF only, documents take all four types. */
export function checkUploadFile(file: Pick<File, 'name' | 'type' | 'size'>): UploadCheck {
	const type = declaredPdfOrPhotoType(file);
	if (!type) return { ok: false, message: `${file.name} isn't a PDF, JPG, PNG or HEIC file.` };
	if (file.size === 0) return { ok: false, message: `${file.name} is empty.` };
	if (file.size > PDF_OR_PHOTO_MAX_BYTES) return { ok: false, message: `${file.name} is over the 10 MB limit.` };
	return { ok: true, type, kinds: type === 'application/pdf' ? ['counseling', 'document'] : ['document'] };
}

/** `?add=counseling` or `?add=document` names the kind the upload flow opens with. */
export function uploadIntentFromSearch(params: URLSearchParams): UploadKind | null {
	const add = params.get('add');
	return add === 'counseling' || add === 'document' ? add : null;
}
