import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const { currentPassword, password, confirmPassword } = (await request.json()) as {
		currentPassword?: string;
		password?: string;
		confirmPassword?: string;
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

	const isRecoveryOrInviteFlow = locals.authFlow === 'recovery' || locals.authFlow === 'invite';

	if (!isRecoveryOrInviteFlow) {
		if (!currentPassword) {
			return json({ error: 'Current password is required' }, { status: 400 });
		}

		if (password !== confirmPassword) {
			return json({ error: 'New passwords do not match' }, { status: 400 });
		}

		const email = locals.user?.email;
		if (!email) {
			return json({ error: 'Current user email is unavailable' }, { status: 401 });
		}

		const { error: signInError } = await locals.supabase.auth.signInWithPassword({
			email,
			password: currentPassword
		});

		if (signInError) {
			return json({ error: 'Current password is incorrect' }, { status: 401 });
		}
	}

	const { error } = await locals.supabase.auth.updateUser({ password });

	if (error) {
		const providerPasswordError = mapProviderPasswordError(error);
		if (providerPasswordError) {
			return json({ error: providerPasswordError }, { status: 400 });
		}
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
