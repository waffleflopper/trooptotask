import type { Cookies } from '@sveltejs/kit';

const LAST_ORGANIZATION_COOKIE = 'last_organization';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** `<userId>:<organizationId>`, so a second person on the same browser never inherits it. */
export function readLastOrganizationId(cookies: Pick<Cookies, 'get'>, userId: string): string | null {
	const value = cookies.get(LAST_ORGANIZATION_COOKIE);
	if (!value?.startsWith(`${userId}:`)) return null;
	return value.slice(userId.length + 1) || null;
}

export function rememberLastOrganization(
	cookies: Pick<Cookies, 'get' | 'set'>,
	input: { userId: string; organizationId: string }
): void {
	const value = `${input.userId}:${input.organizationId}`;
	if (cookies.get(LAST_ORGANIZATION_COOKIE) === value) return;
	cookies.set(LAST_ORGANIZATION_COOKIE, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: ONE_YEAR_SECONDS
	});
}
