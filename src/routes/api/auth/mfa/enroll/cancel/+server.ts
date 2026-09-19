import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const factorId = body && typeof body === 'object' && 'factorId' in body ? body.factorId : undefined;
	if (typeof factorId !== 'string' || !factorId.trim()) {
		return json({ error: 'factorId is required.' }, { status: 400 });
	}

	try {
		const { data, error: lookupError } = await locals.supabase.auth.mfa.listFactors();
		if (lookupError || !data) {
			return json({ error: 'Unable to verify pending MFA enrollment. Try again.' }, { status: 503 });
		}

		// The typed factor lists contain only verified factors; pending factors are in all.
		const pendingFactor = data.all.find(
			(factor) => factor.id === factorId && factor.factor_type === 'totp' && factor.status === 'unverified'
		);
		if (!pendingFactor) {
			return json({ error: 'No pending MFA enrollment found.' }, { status: 400 });
		}

		const { error } = await locals.supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
		if (error) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ ok: true });
	} catch {
		return json({ error: 'Unable to cancel MFA enrollment. Try again.' }, { status: 503 });
	}
};
