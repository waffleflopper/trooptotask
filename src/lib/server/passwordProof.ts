import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export async function verifyPasswordProof(
	userId: string,
	email: string,
	password: string
): Promise<'accepted' | 'incorrect' | 'unavailable'> {
	// Password sign-in creates an AAL1 session. Keep it isolated so it cannot replace the
	// admitted actor or downgrade an existing AAL2 session used by updateUser below.
	const proof = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	let outcome: 'accepted' | 'incorrect' | 'unavailable' = 'unavailable';
	let expiresAt = 0;
	let issuedToken: string | undefined;
	try {
		const result = await proof.auth.signInWithPassword({ email, password });
		const issued = result?.data?.session;
		if (typeof issued?.access_token === 'string' && /^\S+$/.test(issued.access_token))
			issuedToken = issued.access_token;
		if (result?.error && [400, 401, 403].includes(result.error.status ?? 0)) {
			outcome = 'incorrect';
		} else if (
			result?.error === null &&
			result.data?.user?.id === userId &&
			issued?.user?.id === userId &&
			typeof issued.access_token === 'string' &&
			/^\S+$/.test(issued.access_token) &&
			typeof issued.refresh_token === 'string' &&
			/^\S+$/.test(issued.refresh_token) &&
			typeof issued.expires_at === 'number' &&
			Number.isFinite(issued.expires_at) &&
			issued.expires_at > Date.now() / 1000
		) {
			expiresAt = issued.expires_at;
			const identity = await proof.auth.getUser(issued.access_token);
			if (identity?.error === null && identity.data?.user?.id === userId) {
				const assurance = await proof.auth.mfa.getAuthenticatorAssuranceLevel(issued.access_token);
				if (
					assurance?.error === null &&
					['aal1', 'aal2'].includes(assurance.data?.currentLevel ?? '') &&
					['aal1', 'aal2'].includes(assurance.data?.nextLevel ?? '')
				)
					outcome = 'accepted';
			}
		}
	} catch {
		// Provider exceptions can contain credentials. Fail closed without logging them.
	}
	// Revoke only this temporary proof session, including on malformed/error results.
	// Never let a failed proof clear the request session or other browser sessions.
	try {
		// An issued proof token requires actual provider acknowledgment too; the
		// session helper would suppress permission/expiry failures. Failed sign-in
		// without a usable issued token only needs best-effort local cleanup.
		const revoked = issuedToken
			? await proof.auth.admin.signOut(issuedToken, 'local')
			: await proof.auth.signOut({ scope: 'local' });
		if (revoked?.error !== null) return 'unavailable';
	} catch {
		return 'unavailable';
	}
	return outcome === 'accepted' && expiresAt <= Date.now() / 1000 ? 'unavailable' : outcome;
}
