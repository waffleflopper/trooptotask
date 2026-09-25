import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { confirmSensitiveIdentity } from '$features/identity/index.server';

function reply(body: { success: true } | { error?: string; requiresStepUp?: true; stepUpPath?: string }, status = 200) {
	return json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body: unknown = await request.json().catch(() => null);
	const password =
		body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).password : null;
	const outcome = await confirmSensitiveIdentity(locals, cookies, password);
	switch (outcome) {
		case 'inactive':
			return reply(
				{ error: 'Please sign in again before continuing.', requiresStepUp: true, stepUpPath: '/auth/login' },
				401
			);
		case 'password-required':
			return reply({ error: 'Password is required.' }, 400);
		case 'rejected':
			return reply({ error: 'Password confirmation failed. Try again.' }, 401);
		case 'unavailable':
			return reply({ error: 'Unable to confirm your identity. Please try again.' }, 503);
		case 'mfa-required':
			return reply({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
		case 'confirmed':
			return reply({ success: true });
	}
};
