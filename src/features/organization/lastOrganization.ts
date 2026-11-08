/** `<userId>:<organizationId>`, so a second person on the same browser never inherits it. */
export const LAST_ORGANIZATION_COOKIE = 'last_organization';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function readLastOrganizationId(value: string | undefined, userId: string): string | null {
	if (!value?.startsWith(`${userId}:`)) return null;
	return value.slice(userId.length + 1) || null;
}

/**
 * Written by the browser after a navigation commits, never by a server load: hover preloading runs
 * Organization loads the person never opens. The server trusts it only for an Organization still in their list.
 */
export function rememberLastOrganization(input: { userId: string; organizationId: string }): void {
	const value = `${input.userId}:${input.organizationId}`;
	if (document.cookie.split('; ').includes(`${LAST_ORGANIZATION_COOKIE}=${value}`)) return;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${LAST_ORGANIZATION_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
