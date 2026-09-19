export type SessionTokens = { accessToken: string; refreshToken: string };

export function readSessionTokens(hash: string): SessionTokens | null {
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const accessToken = params.get('access_token');
	const refreshToken = params.get('refresh_token');
	if (
		params.getAll('access_token').length !== 1 ||
		params.getAll('refresh_token').length !== 1 ||
		!accessToken ||
		!refreshToken ||
		/\s/.test(accessToken) ||
		/\s/.test(refreshToken)
	)
		return null;
	return { accessToken, refreshToken };
}

export async function establishSession(
	tokens: SessionTokens,
	flow: 'recovery' | 'invite'
): Promise<'ready' | 'invalid' | 'unavailable'> {
	try {
		const response = await fetch('/api/auth/establish-session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...tokens, flow })
		});
		if (response.redirected) return 'unavailable';
		if (response.status === 400 || response.status === 401) return 'invalid';
		const result = await response.json();
		return response.ok && result?.ok === true && !result.error ? 'ready' : 'unavailable';
	} catch {
		return 'unavailable';
	}
}
