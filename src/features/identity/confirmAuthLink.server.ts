import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthConfirmState } from './authConfirm.server';
import { createAuthSessionMarker } from './mfaGate.server';

type ConfirmationResult =
	| { status: 'invalid' }
	| { status: 'sign-in'; next: string }
	| {
			status: 'confirmed';
			next: string;
			cookie: NonNullable<ReturnType<typeof createAuthSessionMarker>>;
	  };

/** Verify one explicit confirmation and decide its limited or admitted session authority. */
export async function confirmAuthLink(input: {
	supabase: SupabaseClient;
	actorUserId: string | null;
	tokenHash: string | null;
	type: string | null;
	next: string | null;
}): Promise<ConfirmationResult> {
	const confirmation = getAuthConfirmState(input);
	if (confirmation.status !== 'valid') return { status: 'invalid' };

	let verified: Awaited<ReturnType<typeof input.supabase.auth.verifyOtp>>;
	try {
		verified = await input.supabase.auth.verifyOtp({
			token_hash: confirmation.tokenHash,
			type: confirmation.type
		});
	} catch {
		return { status: 'invalid' };
	}
	if (verified.error) return { status: 'invalid' };

	const { session, user } = verified.data ?? {};
	if (confirmation.type === 'invite' || confirmation.type === 'recovery') {
		if (!session || !user) return { status: 'invalid' };
		const cookie = createAuthSessionMarker(confirmation.type, session, user);
		return cookie ? { status: 'confirmed', next: confirmation.next, cookie } : { status: 'invalid' };
	}

	// Email changes may continue the admitted account. Signup confirmation alone
	// cannot turn an OTP session into general application access.
	if (confirmation.type !== 'email' || !session || !user || input.actorUserId !== user.id)
		return { status: 'sign-in', next: confirmation.next };

	const cookie = createAuthSessionMarker('complete', session, user);
	return cookie ? { status: 'confirmed', next: confirmation.next, cookie } : { status: 'invalid' };
}
