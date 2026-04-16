import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sanitizePendingAuthFlow, setPendingAuthFlowCookie } from '$lib/server/mfaGate';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const { accessToken, refreshToken, flow } = (await request.json()) as {
		accessToken?: string;
		refreshToken?: string;
		flow?: string;
	};

	if (!accessToken || !refreshToken) {
		return json(
			{
				error: 'Both accessToken and refreshToken are required.'
			},
			{ status: 400 }
		);
	}

	const { error } = await locals.supabase.auth.setSession({
		access_token: accessToken,
		refresh_token: refreshToken
	});

	if (error) {
		return json(
			{
				error: error.message
			},
			{ status: 401 }
		);
	}

	const authFlow = sanitizePendingAuthFlow(flow);
	if (authFlow) {
		setPendingAuthFlowCookie(cookies, authFlow);
	}

	return json({ ok: true });
};
