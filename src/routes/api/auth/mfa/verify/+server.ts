import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return json({ error: 'Enter the 6-digit code from your authenticator app.' }, { status: 400 });
	}

	try {
		const { data: factors, error: lookupError } = await locals.supabase.auth.mfa.listFactors();
		if (lookupError || !factors) {
			return json({ error: 'Unable to verify MFA factors. Try again.' }, { status: 503 });
		}
		const verifiedFactor = factors.all.find(
			(factor) =>
				factor.factor_type === 'totp' &&
				factor.status === 'verified' &&
				typeof factor.id === 'string' &&
				factor.id.trim()
		);
		if (!verifiedFactor) {
			return json({ error: 'No verified MFA factor found.' }, { status: 400 });
		}

		const { data: challenge, error: challengeError } = await locals.supabase.auth.mfa.challengeAndVerify({
			factorId: verifiedFactor.id,
			code
		});
		if (challengeError) {
			return json({ error: challengeError.message }, { status: 401 });
		}
		if (
			typeof challenge?.access_token !== 'string' ||
			!challenge.access_token.trim() ||
			typeof challenge?.refresh_token !== 'string' ||
			!challenge.refresh_token.trim()
		) {
			return json({ error: 'Unable to verify the MFA code. Try again.' }, { status: 503 });
		}

		return json({ ok: true });
	} catch {
		return json({ error: 'Unable to verify MFA. Try again.' }, { status: 503 });
	}
};
