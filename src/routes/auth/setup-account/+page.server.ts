import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAccountSetupLinkService } from '$lib/server/accountSetupLinks';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from '$lib/server/accountSetupCompletionSupabase';
import { createAccountSetupCompletionService } from '$lib/server/accountSetupCompletion';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { getAdminClient, getSupabaseClient } from '$lib/server/supabase';
import { validatePassword } from '$lib/server/validation';

function tokenStateMessage(state: string): string {
	switch (state) {
		case 'expired':
			return 'This Account Setup Link has expired. Request a fresh setup link and use the newest email.';
		case 'revoked':
			return 'This Account Setup Link was replaced. Check your inbox for the newest setup email.';
		case 'used':
		case 'access-request-completed':
			return 'This setup link has already been used. Sign in or reset your password if you need access.';
		default:
			return 'This Account Setup Link is invalid. Request a fresh setup link and try again.';
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	const rawToken = url.searchParams.get('token') ?? '';
	if (!rawToken) {
		return {
			state: 'missing' as const,
			message: tokenStateMessage('missing'),
			token: ''
		};
	}

	const store = createSupabaseAccountSetupCompletionStore(getAdminClient());
	const setupLinks = createAccountSetupLinkService(store);
	const validation = await setupLinks.validateToken(rawToken);
	if (validation.status !== 'valid') {
		return {
			state: validation.status,
			message: tokenStateMessage(validation.status),
			token: rawToken
		};
	}

	const accessRequest = await store.getAccessRequest(validation.accessRequestId);
	if (!accessRequest?.email) {
		return {
			state: 'missing' as const,
			message: tokenStateMessage('missing'),
			token: rawToken
		};
	}

	if (accessRequest.setupCompletedAt) {
		return {
			state: 'used' as const,
			message: tokenStateMessage('access-request-completed'),
			token: rawToken
		};
	}

	return {
		state: 'valid' as const,
		email: accessRequest.email,
		token: rawToken
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawToken = String(formData.get('token') ?? '');
		const password = String(formData.get('password') ?? '');
		const confirmPassword = String(formData.get('confirmPassword') ?? '');

		if (!rawToken) {
			return fail(400, { error: tokenStateMessage('missing') });
		}

		const passwordError = validatePassword(password);
		if (passwordError) {
			return fail(400, { error: passwordError });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match' });
		}

		const adminClient = getAdminClient();
		const store = createSupabaseAccountSetupCompletionStore(adminClient);
		const auth = createSupabaseAccountSetupAuthAdapter(adminClient, getSupabaseClient(locals));
		const completion = await createAccountSetupCompletionService(store, auth).complete({
			rawToken,
			password
		});

		if (completion.status === 'completed') {
			redirect(303, '/dashboard');
		}

		if (completion.status === 'account-create-failed' || completion.status === 'sign-in-failed') {
			return fail(500, { error: completion.message });
		}

		return fail(400, { error: tokenStateMessage(completion.status) });
	}
};
