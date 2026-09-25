import { redirect } from '@sveltejs/kit';
import { confirmAuthLink, getAuthConfirmState } from '$features/identity/index.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	return {
		confirmation: getAuthConfirmState(url.searchParams)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const result = await confirmAuthLink({
			supabase: locals.supabase,
			actorUserId: locals.actor?.userId ?? null,
			tokenHash: formData.get('tokenHash')?.toString() ?? null,
			type: formData.get('type')?.toString() ?? null,
			next: formData.get('next')?.toString() ?? null
		});
		if (result.status === 'invalid') redirect(303, '/auth/login?error=auth_link_invalid');
		if (result.status === 'sign-in') redirect(303, `/auth/login?next=${encodeURIComponent(result.next)}`);
		cookies.set(result.cookie.name, result.cookie.value, result.cookie.options);
		redirect(303, result.next);
	}
};
