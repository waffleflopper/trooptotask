import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { factorId, code } = (await request.json()) as {
		factorId?: string;
		code?: string;
	};

	if (!factorId || !code) {
		return json(
			{
				error: 'Both factorId and code are required.'
			},
			{ status: 400 }
		);
	}

	const { error } = await locals.supabase.auth.mfa.challengeAndVerify({
		factorId,
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
