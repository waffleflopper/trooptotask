/**
 * Keeps auth return paths inside the app. Backslashes are rejected instead of
 * normalized because browsers and URL parsers can treat them like path slashes.
 */
export function sanitizeAuthNextPath(value: FormDataEntryValue | string | null | undefined): string | null {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return null;
	}

	const origin = 'http://localhost';

	try {
		const url = new URL(value, origin);
		const path = `${url.pathname}${url.search}${url.hash}`;

		if (path.startsWith('//')) {
			return null;
		}

		return path;
	} catch {
		return null;
	}
}
