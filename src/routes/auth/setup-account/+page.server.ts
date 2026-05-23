import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAccountSetupLinkService, type AccountSetupLinkRecord } from '$lib/server/accountSetupLinks';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from '$lib/server/accountSetupCompletionSupabase';
import { createAccountSetupCompletionService } from '$lib/server/accountSetupCompletion';
import {
	clearAccountSetupSessionCookie,
	createAccountSetupSession,
	readAccountSetupSessionCookie,
	setAccountSetupSessionCookie
} from '$lib/server/accountSetupSessions';
import {
	ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE,
	checkAccountSetupCompletionRateLimit
} from '$lib/server/accountSetupRateLimit';
import { auditLog } from '$lib/server/auditLog';
import { durableRateLimitAuditDetails } from '$lib/server/durableRateLimit';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { getAdminClient, getSupabaseClient } from '$lib/server/supabase';
import { mapProviderPasswordError, validatePassword } from '$lib/server/validation';

function tokenStateMessage(state: string): string {
	switch (state) {
		case 'expired':
			return 'This Account Setup Link has expired. Request a fresh setup link and use the newest email.';
		case 'revoked':
			return 'This Account Setup Link was replaced. Check your inbox for the newest setup email.';
		case 'replaced':
			return 'This Account Setup Link was replaced. Check your inbox for the newest setup email.';
		case 'claimed':
			return 'This Account Setup Link is already being used. Request a fresh setup link if setup does not finish.';
		case 'failed':
			return 'This Account Setup Link could not finish setup. Request a fresh setup link and try again.';
		case 'completed':
		case 'used':
		case 'access-request-completed':
			return 'This setup link has already been used. Sign in or reset your password if you need access.';
		case 'access-request-not-approved':
			return 'This Account Setup Link is no longer approved. Request access again or contact support.';
		case 'session-expired':
			return 'This setup session has expired. Open the newest setup email or request a fresh setup link.';
		default:
			return 'This Account Setup Link is invalid. Request a fresh setup link and try again.';
	}
}

function getSetupLinkState(link: AccountSetupLinkRecord, now: Date): string {
	if (link.usedAt) return 'used';
	if (link.failedAt) return 'failed';
	if (link.claimedAt) return 'claimed';
	if (link.revokedAt) return link.revocationReason === 'replaced' ? 'replaced' : 'revoked';
	if (link.expiresAt <= now) return 'expired';
	return 'valid';
}

function claimedSetupFailureMessage(): string {
	return 'We could not finish account setup after claiming this link. Request a fresh setup link or ask an admin to resend setup.';
}

function manualSignInMessage(): string {
	return 'Your account was created successfully, but automatic sign-in could not finish. Please sign in manually.';
}

function auditAccountSetupClaimed(input: {
	setupLinkId: string;
	accessRequestId: string;
	clientIp: string;
	userAgent: string;
}): Promise<void> {
	return auditLog(
		{
			action: 'account_setup.claimed',
			resourceType: 'account_setup_link',
			resourceId: input.setupLinkId,
			details: {
				accessRequestId: input.accessRequestId,
				stateTransition: 'pending.claimed'
			}
		},
		{
			userId: null,
			ip: input.clientIp,
			userAgent: input.userAgent
		}
	);
}

function auditAccountSetupCompleted(input: {
	setupLinkId: string;
	accessRequestId: string;
	userId: string;
	clientIp: string;
	userAgent: string;
}): Promise<void> {
	return auditLog(
		{
			action: 'account_setup.completed',
			resourceType: 'account_setup_link',
			resourceId: input.setupLinkId,
			details: {
				accessRequestId: input.accessRequestId,
				userId: input.userId,
				outcome: 'completed'
			}
		},
		{
			userId: null,
			ip: input.clientIp,
			userAgent: input.userAgent
		}
	);
}

function auditAccountSetupFailed(input: {
	setupLinkId: string;
	accessRequestId: string;
	failureCategory: string;
	clientIp: string;
	userAgent: string;
}): Promise<void> {
	return auditLog(
		{
			action: 'account_setup.failed',
			resourceType: 'account_setup_link',
			resourceId: input.setupLinkId,
			severity: 'warning',
			details: {
				accessRequestId: input.accessRequestId,
				failureCategory: input.failureCategory,
				outcome: 'failed'
			}
		},
		{
			userId: null,
			ip: input.clientIp,
			userAgent: input.userAgent
		}
	);
}

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	const store = createSupabaseAccountSetupCompletionStore(getAdminClient());
	const setupLinks = createAccountSetupLinkService(store);
	const rawToken = url.searchParams.get('token') ?? '';
	if (rawToken) {
		const validation = await setupLinks.validateToken(rawToken);
		if (validation.status !== 'valid') {
			clearAccountSetupSessionCookie(cookies);
			return {
				state: validation.status,
				message: tokenStateMessage(validation.status)
			};
		}

		const accessRequest = await store.getAccessRequest(validation.accessRequestId);
		if (!accessRequest?.email) {
			clearAccountSetupSessionCookie(cookies);
			return {
				state: 'missing' as const,
				message: tokenStateMessage('missing')
			};
		}

		if (accessRequest.setupCompletedAt) {
			clearAccountSetupSessionCookie(cookies);
			return {
				state: 'used' as const,
				message: tokenStateMessage('access-request-completed')
			};
		}

		if (accessRequest.status !== 'approved') {
			clearAccountSetupSessionCookie(cookies);
			return {
				state: 'access-request-not-approved' as const,
				message: tokenStateMessage('access-request-not-approved')
			};
		}

		setAccountSetupSessionCookie(
			cookies,
			createAccountSetupSession({
				setupLinkId: validation.link.id,
				accessRequestId: validation.accessRequestId
			})
		);
		redirect(303, '/auth/setup-account');
	}

	const setupSession = readAccountSetupSessionCookie(cookies);
	if (!setupSession) {
		return {
			state: 'missing' as const,
			message: tokenStateMessage('session-expired')
		};
	}

	const accessRequest = await store.getAccessRequest(setupSession.accessRequestId);
	if (!accessRequest?.email) {
		clearAccountSetupSessionCookie(cookies);
		return {
			state: 'missing' as const,
			message: tokenStateMessage('missing')
		};
	}

	if (accessRequest.setupCompletedAt) {
		clearAccountSetupSessionCookie(cookies);
		return {
			state: 'used' as const,
			message: tokenStateMessage('access-request-completed')
		};
	}

	if (accessRequest.status !== 'approved') {
		clearAccountSetupSessionCookie(cookies);
		return {
			state: 'access-request-not-approved' as const,
			message: tokenStateMessage('access-request-not-approved')
		};
	}

	const setupLink = await store.getSetupLink(setupSession.setupLinkId);
	if (!setupLink || setupLink.accessRequestId !== setupSession.accessRequestId) {
		clearAccountSetupSessionCookie(cookies);
		return {
			state: 'missing' as const,
			message: tokenStateMessage('missing')
		};
	}

	const setupLinkState = getSetupLinkState(setupLink, new Date());
	if (setupLinkState !== 'valid') {
		clearAccountSetupSessionCookie(cookies);
		return {
			state: setupLinkState,
			message: tokenStateMessage(setupLinkState)
		};
	}

	return {
		state: 'valid' as const,
		email: accessRequest.email
	};
};

export const actions: Actions = {
	default: async ({ cookies, getClientAddress, request, locals }) => {
		const formData = await request.formData();
		const password = String(formData.get('password') ?? '');
		const confirmPassword = String(formData.get('confirmPassword') ?? '');
		const setupSession = readAccountSetupSessionCookie(cookies);

		if (!setupSession) {
			clearAccountSetupSessionCookie(cookies);
			return fail(400, { error: tokenStateMessage('session-expired') });
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
		const accessRequest = await store.getAccessRequest(setupSession.accessRequestId);
		const clientIp = getClientAddress();
		const userAgent = request.headers.get('user-agent') ?? '';
		const rateLimit = await checkAccountSetupCompletionRateLimit({
			setupLinkId: setupSession.setupLinkId,
			accessRequestId: setupSession.accessRequestId,
			email: accessRequest?.email ?? null,
			ip: clientIp
		});
		if (rateLimit.limited) {
			await auditLog(
				{
					action: 'account_setup.completion_rate_limited',
					resourceType: 'account_setup_link',
					resourceId: setupSession.setupLinkId,
					severity: 'warning',
					details: {
						accessRequestId: setupSession.accessRequestId,
						rateLimit: durableRateLimitAuditDetails(rateLimit)
					}
				},
				{
					userId: null,
					ip: clientIp,
					userAgent
				}
			);
			return fail(429, { error: ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE });
		}

		const auth = createSupabaseAccountSetupAuthAdapter(adminClient, getSupabaseClient(locals));
		const completion = await createAccountSetupCompletionService(store, auth).completeSetupSession({
			setupLinkId: setupSession.setupLinkId,
			accessRequestId: setupSession.accessRequestId,
			password
		});

		const setupAuditContext = {
			setupLinkId: setupSession.setupLinkId,
			accessRequestId: setupSession.accessRequestId,
			clientIp,
			userAgent
		};
		const postClaimOutcome =
			(completion.status === 'completed' && 'userId' in completion) ||
			completion.status === 'account-create-failed' ||
			completion.status === 'setup-finalization-failed' ||
			completion.status === 'sign-in-failed';

		if (postClaimOutcome) {
			await auditAccountSetupClaimed(setupAuditContext);
		}

		if (completion.status === 'completed' && 'userId' in completion) {
			await auditAccountSetupCompleted({
				setupLinkId: setupSession.setupLinkId,
				accessRequestId: setupSession.accessRequestId,
				userId: completion.userId,
				clientIp,
				userAgent
			});
			clearAccountSetupSessionCookie(cookies);
			redirect(303, '/dashboard');
		}

		if (completion.status === 'account-create-failed') {
			await auditAccountSetupFailed({
				setupLinkId: setupSession.setupLinkId,
				accessRequestId: setupSession.accessRequestId,
				failureCategory: 'account-create-failed',
				clientIp,
				userAgent
			});
			clearAccountSetupSessionCookie(cookies);
			const providerPasswordError = mapProviderPasswordError(completion.message);
			if (providerPasswordError) {
				return fail(400, {
					error: `${providerPasswordError} Request a fresh setup link, then try again.`
				});
			}
			return fail(500, { error: claimedSetupFailureMessage() });
		}

		if (completion.status === 'setup-finalization-failed') {
			await auditAccountSetupFailed({
				setupLinkId: setupSession.setupLinkId,
				accessRequestId: setupSession.accessRequestId,
				failureCategory: 'setup-finalization-failed',
				clientIp,
				userAgent
			});
			clearAccountSetupSessionCookie(cookies);
			return fail(500, { error: claimedSetupFailureMessage() });
		}

		if (completion.status === 'sign-in-failed') {
			await auditAccountSetupFailed({
				setupLinkId: setupSession.setupLinkId,
				accessRequestId: setupSession.accessRequestId,
				failureCategory: 'sign-in-failed',
				clientIp,
				userAgent
			});
			clearAccountSetupSessionCookie(cookies);
			return fail(500, { error: manualSignInMessage() });
		}

		await auditAccountSetupFailed({
			setupLinkId: setupSession.setupLinkId,
			accessRequestId: setupSession.accessRequestId,
			failureCategory: completion.status,
			clientIp,
			userAgent
		});
		clearAccountSetupSessionCookie(cookies);
		return fail(400, { error: tokenStateMessage(completion.status) });
	}
};
