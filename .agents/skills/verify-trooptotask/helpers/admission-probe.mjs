const PATHS = ['/account/security', '/api/auth/mfa/status'];
const WITHHELD = '[genuine signature withheld]';

const base64url = (value) =>
	Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export function authCookieName(providerUrl) {
	return `sb-${new URL(providerUrl).hostname.split('.')[0]}-auth-token`;
}

function sessionCookie(accessToken, refreshToken, expiresAt) {
	return `base64-${base64url({
		access_token: accessToken,
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: expiresAt,
		refresh_token: refreshToken
	})}`;
}

// Builds the forged variants from one genuine provider token. Only the genuine
// token can authenticate; the archived forms never carry its signature.
export function forgedSessions(genuine, otherUserId) {
	const [header, payload, signature] = genuine.access_token.split('.');
	const claims = decode(payload);
	const swapped = base64url({ ...claims, sub: otherUserId, email: undefined });
	const randomSignature = base64url(`forged-${claims.session_id ?? 'session'}-${Date.now()}`);
	const none = `${base64url({ alg: 'none', typ: 'JWT' })}.${swapped}.`;
	const cases = {
		badSignature: {
			token: `${header}.${payload}.${randomSignature}`,
			archived: `${header}.${payload}.${randomSignature}`
		},
		subjectSwap: { token: `${header}.${swapped}.${signature}`, archived: `${header}.${swapped}.${WITHHELD}` },
		algNone: { token: none, archived: none }
	};
	return Object.fromEntries(
		Object.entries(cases).map(([name, { token, archived }]) => [
			name,
			{
				cookie: sessionCookie(token, 'forged-refresh', genuine.expires_at),
				archived,
				claims: decode(token.split('.')[1])
			}
		])
	);
}

export async function probeAdmission({ origin, providerUrl, anonKey, email, password, otherUserId, fetch }) {
	const login = await fetch(`${providerUrl}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: anonKey, 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const genuine = await login.json();
	if (!login.ok || typeof genuine?.access_token !== 'string') throw new Error('Provider sign-in for the probe failed.');
	const name = authCookieName(providerUrl);
	const forged = forgedSessions(genuine, otherUserId);
	const cases = {
		genuine: sessionCookie(genuine.access_token, genuine.refresh_token, genuine.expires_at),
		malformed: 'base64-not-json',
		...Object.fromEntries(Object.entries(forged).map(([key, value]) => [key, value.cookie]))
	};
	const results = [];
	try {
		for (const [label, value] of Object.entries(cases))
			for (const path of PATHS) {
				const response = await fetch(`${origin}${path}`, {
					redirect: 'manual',
					headers: { cookie: `${name}=${value}` }
				});
				results.push({ case: label, path, status: response.status, location: response.headers.get('location') });
			}
	} finally {
		await fetch(`${providerUrl}/auth/v1/logout?scope=global`, {
			method: 'POST',
			headers: { apikey: anonKey, Authorization: `Bearer ${genuine.access_token}` }
		});
	}
	return {
		cookieName: name,
		results,
		forged: Object.fromEntries(
			Object.entries(forged).map(([key, value]) => [key, { token: value.archived, claims: value.claims }])
		)
	};
}
