function safeDocumentFilename(filename: string): string {
	const cleaned = filename
		.split(/[\\/]/)
		.pop()
		?.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return cleaned || '';
}

export function derivePersonnelDocumentTitle(input: { title?: string | null; filename?: string | null }): string {
	const explicitTitle = input.title?.trim();
	if (explicitTitle) return explicitTitle;

	const base = safeDocumentFilename(input.filename ?? '').replace(/\.[^.]+$/, '');
	const title = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
	return title || 'Uploaded document';
}
