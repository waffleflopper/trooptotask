import type { SupabaseClient } from '@supabase/supabase-js';

type LoginResult = { status: 'authenticated'; mfaPending: boolean } | { status: 'invalid' | 'unavailable' };

// Credentials and provider sessions stay at the Identity server edge. The caller
// receives only the outcome needed to continue authentication.
export async function loginIdentity(
	{ supabase }: { supabase: SupabaseClient },
	credentials: { email: string; password: string }
): Promise<LoginResult> {
	try {
		const { data, error } = await supabase.auth.signInWithPassword(credentials);
		if (error) {
			return { status: error.status && error.status >= 500 ? 'unavailable' : 'invalid' };
		}
		if (
			typeof data?.user?.id !== 'string' ||
			!data.user.id ||
			data.session?.user?.id !== data.user.id ||
			typeof data.session?.access_token !== 'string' ||
			!data.session.access_token ||
			typeof data.session?.refresh_token !== 'string' ||
			!data.session.refresh_token
		) {
			return { status: 'unavailable' };
		}

		const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
		if (
			assuranceError ||
			!assurance ||
			!['aal1', 'aal2'].includes(assurance.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(assurance.nextLevel ?? '')
		) {
			return { status: 'unavailable' };
		}
		return {
			status: 'authenticated',
			mfaPending: assurance.nextLevel === 'aal2' && assurance.currentLevel === 'aal1'
		};
	} catch {
		// Provider exceptions can contain submitted credentials. Never log them.
		console.error('Login provider unavailable');
		return { status: 'unavailable' };
	}
}
