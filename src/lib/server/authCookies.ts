export function getAuthCookieOptions<T extends { path?: string; httpOnly?: boolean }>(
	options: T
): T & { path: string; httpOnly: true } {
	return {
		...options,
		path: '/',
		httpOnly: true
	};
}
