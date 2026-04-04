import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePassword } from '$lib/server/validation';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
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

	if (!locals.session) {
		return json(
			{
				error: 'Your account recovery session is no longer active. Please reopen the link and try again.'
			},
			{ status: 401 }
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

	if (locals.authFlow === 'recovery') {
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	}

	return json({ ok: true });
};
