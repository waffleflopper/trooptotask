import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	clearAccountSetupSessionCookie,
	readAccountSetupSessionCookie,
	setAccountSetupSessionCookie
} from '$features/identity/index.server';
import { createSupabaseAccountSetupRouteFlow } from '$features/identity/index.server';
import { auditLog } from '$lib/audit/index.server';

const SUPPORT_COOKIE = 'ttt_account_setup_support';
const SUPPORT_COOKIE_PATH = '/auth/setup-account';
const SUPPORT_MESSAGE = 'Contact platform support to resolve the previous setup attempt before trying another link.';

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
	const supportRequired = cookies.get(SUPPORT_COOKIE) === '1';
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
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		redirect(303, result.path);
	}

	if (result.state === 'redirect-setup') {
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		setAccountSetupSessionCookie(cookies, result.session);
		redirect(303, result.path);
	}

	if (result.state === 'valid') {
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		return result;
	}

	if (result.state === 'missing' && supportRequired) {
		return { state: 'support-required' as const, message: SUPPORT_MESSAGE };
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
			if (cookies.get(SUPPORT_COOKIE)) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
			redirect(303, result.path);
		}

		if (result.supportRequired) {
			cookies.set(SUPPORT_COOKIE, '1', {
				path: SUPPORT_COOKIE_PATH,
				httpOnly: true,
				sameSite: 'lax',
				secure: !import.meta.env.DEV,
				maxAge: 14 * 24 * 60 * 60
			});
		}

		return fail(result.status, { error: result.error, supportRequired: result.supportRequired ?? false });
	}
};
