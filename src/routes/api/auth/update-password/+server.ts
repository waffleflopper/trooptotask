import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePassword } from '$lib/server/validation';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { password, accessToken, refreshToken } = (await request.json()) as {
		password?: string;
		accessToken?: string;
		refreshToken?: string;
	};

	const passwordError = validatePassword(password ?? '');
	if (passwordError) {
		return json(
			{
				error: passwordError
			},
			{ status: 400 }
		);
	}

	if (!locals.session && accessToken && refreshToken) {
		const { error: sessionError } = await locals.supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken
		});

		if (sessionError) {
			return json(
				{
					error: sessionError.message
				},
				{ status: 401 }
			);
		}
	}

	const { error } = await locals.supabase.auth.updateUser({ password });

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
