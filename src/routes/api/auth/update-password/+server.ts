import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePassword } from '$lib/server/validation';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { password } = (await request.json()) as {
		password?: string;
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
