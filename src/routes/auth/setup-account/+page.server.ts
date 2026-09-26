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
const RECOVERY_COOKIE = 'ttt_account_setup_recovery_state';
const SUPPORT_COOKIE_PATH = '/auth/setup-account';
const SUPPORT_MESSAGE = 'Contact platform support to resolve the previous setup attempt before trying another link.';
const RECOVERED_MESSAGE = 'Account setup is complete. Sign in with the password you chose, or reset it if needed.';

type RecoveryState = 'recovery-available' | 'recovered' | 'retry-password' | 'fresh-link-required';

function setRecoveryCookie(cookies: Parameters<PageServerLoad>[0]['cookies'], linkId: string, state: RecoveryState) {
	if (state === 'retry-password' || state === 'fresh-link-required') {
		cookies.delete(RECOVERY_COOKIE, { path: SUPPORT_COOKIE_PATH });
		return;
	}
	cookies.set(RECOVERY_COOKIE, `${linkId}:${state === 'recovered' ? 'recovered' : 'pending'}`, {
		path: SUPPORT_COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: 10 * 60
	});
}

function applyProgress(
	cookies: Parameters<PageServerLoad>[0]['cookies'],
	linkId: string,
	result: { state: RecoveryState; message: string; clearSession?: true }
) {
	setRecoveryCookie(cookies, linkId, result.state);
	if (result.clearSession) clearAccountSetupSessionCookie(cookies);
	return { recoveryState: result.state, message: result.message };
}

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
	const supportRequired = cookies.get(SUPPORT_COOKIE) === '1';
	const recoveryCookie = cookies.get(RECOVERY_COOKIE);
	const setupSession = readAccountSetupSessionCookie(cookies);
	const flow = createSupabaseAccountSetupRouteFlow(locals, auditLog);
	const result = await flow.resolveLoad({
		session: locals.session,
		authFlow: locals.authFlow,
		mfaPending: locals.mfaPending,
		rawToken: url.searchParams.get('token') ?? '',
		setupSession
	});

	const recoveredReceipt = setupSession && recoveryCookie === `${setupSession.setupLinkId}:recovered`;
	if ('clearSession' in result && result.clearSession && !(recoveredReceipt && result.state === 'used')) {
		clearAccountSetupSessionCookie(cookies);
	}
	if (!setupSession && recoveryCookie) cookies.delete(RECOVERY_COOKIE, { path: SUPPORT_COOKIE_PATH });

	if (result.state === 'redirect-authenticated') {
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		redirect(303, result.path);
	}

	if (result.state === 'redirect-setup') {
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		if (recoveryCookie && !recoveryCookie.startsWith(`${result.session.setupLinkId}:`)) {
			cookies.delete(RECOVERY_COOKIE, { path: SUPPORT_COOKIE_PATH });
		}
		setAccountSetupSessionCookie(cookies, result.session);
		redirect(303, result.path);
	}

	if (result.state === 'valid') {
		if (supportRequired) cookies.delete(SUPPORT_COOKIE, { path: SUPPORT_COOKIE_PATH });
		if (setupSession && recoveryCookie === `${setupSession.setupLinkId}:pending`) {
			return { state: 'recovery-available' as const, email: result.email };
		}
		return result;
	}
	if (result.state === 'recovery-available') return result;

	if (recoveredReceipt && result.state === 'used') {
		return { state: 'recovered' as const, message: RECOVERED_MESSAGE };
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
	complete: async ({ cookies, getClientAddress, request, locals }) => {
		const formData = await request.formData();
		const setupSession = readAccountSetupSessionCookie(cookies);
		const flow = createSupabaseAccountSetupRouteFlow(locals, auditLog);
		const result = await flow.completeSetup({
			setupSession,
			password: String(formData.get('password') ?? ''),
			confirmPassword: String(formData.get('confirmPassword') ?? ''),
			clientIp: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? ''
		});
		if (result.type === 'progress') {
			if (!setupSession) return fail(400, { error: 'This setup session has expired.', supportRequired: false });
			return applyProgress(cookies, setupSession.setupLinkId, result);
		}

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
	},
	recover: async ({ cookies, getClientAddress, request, locals }) => {
		const setupSession = readAccountSetupSessionCookie(cookies);
		if (!setupSession) {
			return fail(400, {
				error: 'This setup session has expired. Open the newest setup email or request a fresh setup link.',
				supportRequired: false
			});
		}
		const flow = createSupabaseAccountSetupRouteFlow(locals, auditLog);
		const result = await flow.recoverSetup({
			setupSession,
			clientIp: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? ''
		});
		if (result.type === 'progress') return applyProgress(cookies, setupSession.setupLinkId, result);
		if (result.type === 'redirect') {
			clearAccountSetupSessionCookie(cookies);
			redirect(303, result.path);
		}
		if (result.clearSession) clearAccountSetupSessionCookie(cookies);
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
