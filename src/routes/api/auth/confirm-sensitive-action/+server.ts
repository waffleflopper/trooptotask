import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const email = locals.user?.email;
	if (!email) {
		return json(
			{ error: 'Please sign in again before continuing.', requiresStepUp: true, stepUpPath: '/auth/login' },
			{ status: 401 }
		);
	}

	const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
	const password = typeof body?.password === 'string' ? body.password : '';
	if (!password) {
		return json({ error: 'Password is required.' }, { status: 400 });
	}

	const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
	if (error) {
		return json({ error: 'Password confirmation failed. Try again.' }, { status: 401 });
	}

	const { data: aalData, error: aalError } = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
	if (!aalError && aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
		return json({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
	}

	return json({ success: true });
};
