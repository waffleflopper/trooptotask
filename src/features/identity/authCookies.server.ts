import type { Cookies } from '@sveltejs/kit';

export function getAuthCookieOptions<T extends { path?: string; httpOnly?: boolean }>(
	options: T
): T & { path: string; httpOnly: true } {
	return {
		...options,
		path: '/',
		httpOnly: true
	};
}

type AuthCookie = { name: string; value: string; options: NonNullable<Parameters<Cookies['set']>[2]> };

// cookies.set throws once the response exists, and a streamed load can still refresh the provider
// session then. That throw is an unhandled rejection that exits the process, so late cookies are dropped.
export function createAuthCookieWriter(cookies: Pick<Cookies, 'set'>) {
	let responseGenerated = false;
	return {
		markResponseGenerated() {
			responseGenerated = true;
		},
		setAll(cookiesToSet: AuthCookie[]) {
			if (responseGenerated) {
				console.warn('[auth-session]', { event: 'cookies_dropped_after_response', count: cookiesToSet.length });
				return;
			}
			for (const { name, value, options } of cookiesToSet) {
				cookies.set(name, value, getAuthCookieOptions(options));
			}
		}
	};
}
