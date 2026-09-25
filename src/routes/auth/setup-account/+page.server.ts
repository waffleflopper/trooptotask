import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	clearAccountSetupSessionCookie,
	readAccountSetupSessionCookie,
	setAccountSetupSessionCookie
} from '$features/identity/index.server';
import { createSupabaseAccountSetupRouteFlow } from '$features/identity/index.server';
import { auditLog } from '$lib/audit/index.server';

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
	const flow = createSupabaseAccountSetupRouteFlow(locals, auditLog);
	const result = await flow.resolveLoad({
		session: locals.session,
		authFlow: locals.authFlow,
		mfaPending: locals.mfaPending,
		rawToken: url.searchParams.get('token') ?? '',
		setupSession: readAccountSetupSessionCookie(cookies)
	});

	if ('clearSession' in result && result.clearSession) {
		clearAccountSetupSessionCookie(cookies);
	}

	if (result.state === 'redirect-authenticated') {
		redirect(303, result.path);
	}

	if (result.state === 'redirect-setup') {
		setAccountSetupSessionCookie(cookies, result.session);
		redirect(303, result.path);
	}

	if (result.state === 'valid') {
		return result;
	}

	return {
		state: result.state,
		message: result.message
	};
};

export const actions: Actions = {
	default: async ({ cookies, getClientAddress, request, locals }) => {
		const formData = await request.formData();
		const flow = createSupabaseAccountSetupRouteFlow(locals, auditLog);
		const result = await flow.completeSetup({
			setupSession: readAccountSetupSessionCookie(cookies),
			password: String(formData.get('password') ?? ''),
			confirmPassword: String(formData.get('confirmPassword') ?? ''),
			clientIp: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? ''
		});

		if (result.clearSession) {
			clearAccountSetupSessionCookie(cookies);
		}

		if (result.type === 'redirect') {
			redirect(303, result.path);
		}

		return fail(result.status, { error: result.error, supportRequired: result.supportRequired ?? false });
	}
};
