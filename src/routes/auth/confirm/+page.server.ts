import { redirect } from '@sveltejs/kit';
import { getAuthConfirmState } from '$lib/server/authConfirm';
import { setPendingAuthFlowCookie } from '$lib/server/mfaGate';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	return {
		confirmation: getAuthConfirmState(url.searchParams)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const confirmation = getAuthConfirmState({
			tokenHash: formData.get('tokenHash')?.toString(),
			type: formData.get('type')?.toString(),
			next: formData.get('next')?.toString()
		});

		if (confirmation.status !== 'valid') {
			redirect(303, '/auth/login?error=auth_link_invalid');
		}

		const { error } = await locals.supabase.auth.verifyOtp({
			token_hash: confirmation.tokenHash,
			type: confirmation.type
		});

		if (error) {
			redirect(303, '/auth/login?error=auth_link_invalid');
		}

		setPendingAuthFlowCookie(cookies, confirmation.type);
		redirect(303, confirmation.next);
	}
};
