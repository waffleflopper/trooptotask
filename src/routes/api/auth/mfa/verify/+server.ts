import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { code } = (await request.json()) as {
		code?: string;
	};

	if (!code || !/^\d{6}$/.test(code)) {
		return json(
			{
				error: 'Enter the 6-digit code from your authenticator app.'
			},
			{ status: 400 }
		);
	}

	const { data: factors } = await locals.supabase.auth.mfa.listFactors();
	const totpFactors = factors?.totp ?? [];
	const verifiedFactor = totpFactors.find((factor: Record<string, unknown>) => factor.status === 'verified');

	if (!verifiedFactor) {
		return json(
			{
				error: 'No verified MFA factor found.'
			},
			{ status: 400 }
		);
	}

	const { error } = await locals.supabase.auth.mfa.challengeAndVerify({
		factorId: verifiedFactor.id as string,
		code
	});

	if (error) {
		return json(
			{
				error: error.message
			},
			{ status: 401 }
		);
	}

	return json({ ok: true });
};
