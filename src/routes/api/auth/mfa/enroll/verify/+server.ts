import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const factorId = body && typeof body === 'object' && 'factorId' in body ? body.factorId : undefined;
	const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
	if (typeof factorId !== 'string' || !factorId.trim() || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return json({ error: 'A factorId and a 6-digit code are required.' }, { status: 400 });
	}

	try {
		const { data: factors, error: lookupError } = await locals.supabase.auth.mfa.listFactors();
		if (lookupError || !factors) {
			return json({ error: 'Unable to verify pending MFA enrollment. Try again.' }, { status: 503 });
		}
		// Pending factors appear in all; the typed lists contain only verified factors.
		const pendingFactor = factors.all.find(
			(factor) => factor.id === factorId && factor.factor_type === 'totp' && factor.status === 'unverified'
		);
		if (!pendingFactor) {
			return json({ error: 'No pending MFA enrollment found.' }, { status: 400 });
		}
		const { data, error } = await locals.supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactor.id, code });
		if (error) {
			return json({ error: error.message }, { status: 401 });
		}
		if (
			typeof data?.access_token !== 'string' ||
			!data.access_token.trim() ||
			typeof data?.refresh_token !== 'string' ||
			!data.refresh_token.trim()
		) {
			return json({ error: 'Unable to confirm MFA enrollment. Try again.' }, { status: 503 });
		}
		return json({ ok: true });
	} catch {
		return json({ error: 'Unable to confirm MFA enrollment. Try again.' }, { status: 503 });
	}
};
