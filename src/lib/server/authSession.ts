export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
	return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function hasSupabaseAuthCookie(cookieNames: string[], storageKey: string): boolean {
	return cookieNames.some((name) => name === storageKey || name.startsWith(`${storageKey}.`));
}
