import { redirect } from '@sveltejs/kit';
import {
	getAuthConfirmState,
	setCompletedAuthFlowCookie,
	setPendingAuthFlowCookie
} from '$features/identity/index.server';
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

		const { data, error } = await locals.supabase.auth.verifyOtp({
			token_hash: confirmation.tokenHash,
			type: confirmation.type
		});

		if (error) {
			redirect(303, '/auth/login?error=auth_link_invalid');
		}

		if (confirmation.type === 'invite' || confirmation.type === 'recovery') {
			if (
				!data?.session ||
				!data.user ||
				!setPendingAuthFlowCookie(cookies, confirmation.type, data.session, data.user)
			)
				redirect(303, '/auth/login?error=auth_link_invalid');
		} else {
			// Email changes may continue an already admitted account. A signup link
			// cannot promote a new OTP session into general application access.
			if (confirmation.type !== 'email' || !data?.session || !data.user || locals.actor?.userId !== data.user.id)
				redirect(303, `/auth/login?next=${encodeURIComponent(confirmation.next)}`);
			if (!setCompletedAuthFlowCookie(cookies, data.session, data.user))
				redirect(303, '/auth/login?error=auth_link_invalid');
		}
		redirect(303, confirmation.next);
	}
};
