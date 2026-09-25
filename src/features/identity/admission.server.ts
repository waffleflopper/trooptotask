import type { Cookies } from '@sveltejs/kit';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AdmittedActor, PendingAuthFlow } from './contracts';
import { isPublicRoute } from './publicRoutes.server';
import {
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	isMfaStepUpRequired,
	sanitizePendingAuthFlow,
	shouldRedirectIncompleteAuthSession
} from './mfaGate.server';

type AdmissionResult =
	| { status: 'allowed'; actor: AdmittedActor | null; mfaPending: boolean; authFlow: PendingAuthFlow }
	| { status: 'redirect'; code: 302 | 303; location: string }
	| { status: 'unavailable'; code: 500 | 503; message: string };

// Only the Identity transport edge supplies the already verified session/user pair.
// A completion-route exception permits that route, never general application authority.
export async function readIdentityAdmission({
	supabase,
	session,
	user,
	cookies,
	pathname,
	method
}: {
	supabase: SupabaseClient;
	session: Session | null;
	user: User | null;
	cookies: Pick<Cookies, 'get' | 'delete'>;
	pathname: string;
	method: string;
}): Promise<AdmissionResult> {
	let authFlow = sanitizePendingAuthFlow(cookies.get(getPendingAuthFlowCookieName()));
	let mfaPending = false;
	if (!session && authFlow) {
		if (method !== 'POST' || !['/auth/logout', '/api/auth/establish-session'].includes(pathname)) {
			cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		}
		authFlow = null;
	}

	if (session && pathname !== '/auth/logout') {
		// readIdentitySession has already hydrated this request-local session with verified user factors.
		// Supplying a JWT here would repeat the provider user request in the current SDK.
		const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null);
		const data = assurance?.data;
		if (
			assurance?.error ||
			!data ||
			!['aal1', 'aal2'].includes(data.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(data.nextLevel ?? '')
		) {
			return { status: 'unavailable', code: 503, message: 'Unable to verify authentication status' };
		}
		mfaPending = isMfaStepUpRequired(data);
	}

	const isMfaEndpoint = pathname === '/api/auth/mfa' || pathname.startsWith('/api/auth/mfa/');
	if (!session && (isMfaEndpoint || !isPublicRoute(pathname))) {
		return { status: 'redirect', code: 303, location: '/auth/login' };
	}
	if (shouldRedirectIncompleteAuthSession(pathname, !!session, mfaPending, authFlow)) {
		return { status: 'redirect', code: 303, location: getAuthenticatedRedirectPath(authFlow, mfaPending) };
	}

	const isMfaCompletion = ['/api/auth/mfa/status', '/api/auth/mfa/verify'].includes(pathname);
	const skipSuspensionCheck =
		(!isMfaEndpoint || isMfaCompletion) &&
		['/auth', '/api/auth', '/suspended'].some((prefix) => pathname.startsWith(prefix));
	let actor: AdmittedActor | null = null;
	if (user && !skipSuspensionCheck) {
		const suspension = await Promise.resolve(supabase.rpc('is_user_suspended', { check_user_id: user.id })).catch(
			() => null
		);
		if (suspension?.error !== null || typeof suspension?.data !== 'boolean') {
			return { status: 'unavailable', code: 500, message: 'Unable to verify account status' };
		}
		if (suspension.data) return { status: 'redirect', code: 302, location: '/suspended' };
		if (session && !mfaPending && !authFlow) actor = { userId: user.id };
	}
	return { status: 'allowed', actor, mfaPending, authFlow };
}
