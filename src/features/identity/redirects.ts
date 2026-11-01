const API_PATH = /(^|\/)api(\/|$)/;

/**
 * Where a signed-out request goes to sign in. Only a browser page visit is a place to return to:
 * a form action, a background data read or an endpoint response is not.
 */
export function signInPathFor(request: {
	url: URL;
	method: string;
	accept: string | null;
	isDataRequest: boolean;
}): string {
	const { url, method, accept, isDataRequest } = request;
	const isPageVisit =
		method === 'GET' && !isDataRequest && accept?.includes('text/html') === true && !API_PATH.test(url.pathname);
	const next = isPageVisit ? sanitizeAuthNextPath(`${url.pathname}${url.search}`) : null;
	return next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login';
}

/**
 * Keeps auth return paths inside the app. Backslashes are rejected instead of
 * normalized because browsers and URL parsers can treat them like path slashes.
 */
export function sanitizeAuthNextPath(value: unknown): string | null {
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
