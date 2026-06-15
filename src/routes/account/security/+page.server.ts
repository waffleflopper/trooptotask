import type { PageServerLoad } from './$types';
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { sanitizeString, validateEmail } from '$lib/server/validation';

function getPendingEmail(user: App.Locals['user']): string | null {
	const rawUser = user as Record<string, unknown> | null;
	const value = rawUser?.new_email ?? rawUser?.email_change ?? rawUser?.email_change_sent_to;
	return typeof value === 'string' && value ? value : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	const { data: factors } = await locals.supabase.auth.mfa.listFactors();
	const totpFactors = factors?.totp ?? [];
	const hasMFA = totpFactors.some((f: Record<string, unknown>) => f.status === 'verified');

	return {
		hasMFA,
		currentEmail: locals.user.email ?? '',
		pendingEmail: getPendingEmail(locals.user)
	};
};

export const actions: Actions = {
	updateEmail: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login');

		const formData = await request.formData();
		const email = sanitizeString(String(formData.get('email') ?? ''), 254).toLowerCase();

		if (!validateEmail(email)) {
			return fail(400, { emailError: 'Enter a valid email address', email });
		}

		if (email === locals.user.email?.toLowerCase()) {
			return fail(400, { emailError: 'Enter a different email address', email });
		}

		const currentPassword = String(formData.get('currentPassword') ?? '');
		if (!currentPassword) {
			return fail(400, { emailError: 'Enter your current password to change your email', email });
		}

		const currentEmail = locals.user.email;
		if (!currentEmail) {
			return fail(401, { emailError: 'Your session is no longer active. Sign in again.', email });
		}

		const { error: reauthError } = await locals.supabase.auth.signInWithPassword({
			email: currentEmail,
			password: currentPassword
		});

		if (reauthError) {
			return fail(401, { emailError: 'Current password is incorrect', email });
		}

		const { error } = await locals.supabase.auth.updateUser({ email });

		if (error) {
			return fail(400, { emailError: error.message, email });
		}

		return {
			emailSuccess: 'Check the new inbox to confirm this change. Until then, keep signing in with your current email.',
			pendingEmail: email
		};
	}
};
