import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { accessToken, refreshToken } = (await request.json()) as {
		accessToken?: string;
		refreshToken?: string;
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

	return json({ ok: true });
};
