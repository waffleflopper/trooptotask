import { createAccountSetupCompletionService, type AccountSetupCompletionStore } from './accountSetupCompletion';
import {
	createAccountSetupLinkService,
	type AccountSetupLinkRecord,
	type ValidateAccountSetupLinkResult
} from './accountSetupLinks';
import { createAccountSetupSession, type AccountSetupSession } from './accountSetupSessions';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from './accountSetupCompletionSupabase';
import {
	ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE,
	checkAccountSetupCompletionRateLimit
} from './accountSetupRateLimit';
import { auditLog } from './auditLog';
import { durableRateLimitAuditDetails } from './durableRateLimit';
import { getAuthenticatedRedirectPath } from './mfaGate';
import { getAdminClient, getSupabaseClient } from './supabase';
import { mapProviderPasswordError, validatePassword } from './validation';

type AccountSetupLinkService = Pick<ReturnType<typeof createAccountSetupLinkService>, 'validateToken'>;
type AccountSetupCompletionService = Pick<
	ReturnType<typeof createAccountSetupCompletionService>,
	'completeSetupSession'
>;
type AccountSetupAudit = typeof auditLog;
type AccountSetupRateLimitCheck = typeof checkAccountSetupCompletionRateLimit;

export type AccountSetupPageState =
	| Exclude<ValidateAccountSetupLinkResult['status'], 'valid'>
	| 'used'
	| 'access-request-not-approved';

export type AccountSetupLoadResult =
	| { state: 'redirect-authenticated'; path: string }
	| { state: 'redirect-setup'; session: AccountSetupSession; path: string }
	| { state: 'valid'; email: string }
	| { state: AccountSetupPageState; message: string; clearSession?: true };

export type AccountSetupCompletionResult =
	| { type: 'redirect'; path: string; clearSession: true }
	| { type: 'failure'; status: 400 | 429 | 500; error: string; clearSession?: true };

interface AccountSetupLoadInput {
	session: App.Locals['session'];
	authFlow: App.Locals['authFlow'];
	mfaPending: App.Locals['mfaPending'];
	rawToken: string;
	setupSession: AccountSetupSession | null;
}

interface AccountSetupCompletionInput {
	setupSession: AccountSetupSession | null;
	password: string;
	confirmPassword: string;
	clientIp: string;
	userAgent: string;
}

interface AccountSetupRouteFlowDependencies {
	store: () => AccountSetupCompletionStore;
	setupLinks: () => AccountSetupLinkService;
	completion: () => AccountSetupCompletionService;
	checkCompletionRateLimit?: AccountSetupRateLimitCheck;
	audit?: AccountSetupAudit;
	now?: () => Date;
}

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

function auditAccountSetupClaimed(
	audit: AccountSetupAudit,
	input: {
		setupLinkId: string;
		accessRequestId: string;
		clientIp: string;
		userAgent: string;
	}
): Promise<void> {
	return audit(
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

function auditAccountSetupCompleted(
	audit: AccountSetupAudit,
	input: {
		setupLinkId: string;
		accessRequestId: string;
		userId: string;
		clientIp: string;
		userAgent: string;
	}
): Promise<void> {
	return audit(
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

function auditAccountSetupFailed(
	audit: AccountSetupAudit,
	input: {
		setupLinkId: string;
		accessRequestId: string;
		failureCategory: string;
		clientIp: string;
		userAgent: string;
	}
): Promise<void> {
	return audit(
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

export function createAccountSetupRouteFlow(dependencies: AccountSetupRouteFlowDependencies) {
	const checkCompletionRateLimit = dependencies.checkCompletionRateLimit ?? checkAccountSetupCompletionRateLimit;
	const audit = dependencies.audit ?? auditLog;
	const now = dependencies.now ?? (() => new Date());

	return {
		async resolveLoad(input: AccountSetupLoadInput): Promise<AccountSetupLoadResult> {
			if (input.session) {
				return {
					state: 'redirect-authenticated',
					path: getAuthenticatedRedirectPath(input.authFlow, input.mfaPending)
				};
			}

			if (input.rawToken) {
				const validation = await dependencies.setupLinks().validateToken(input.rawToken);
				if (validation.status !== 'valid') {
					return {
						state: validation.status,
						message: tokenStateMessage(validation.status),
						clearSession: true
					};
				}

				const accessRequest = await dependencies.store().getAccessRequest(validation.accessRequestId);
				if (!accessRequest?.email) {
					return {
						state: 'missing',
						message: tokenStateMessage('missing'),
						clearSession: true
					};
				}

				if (accessRequest.setupCompletedAt) {
					return {
						state: 'used',
						message: tokenStateMessage('access-request-completed'),
						clearSession: true
					};
				}

				if (accessRequest.status !== 'approved') {
					return {
						state: 'access-request-not-approved',
						message: tokenStateMessage('access-request-not-approved'),
						clearSession: true
					};
				}

				return {
					state: 'redirect-setup',
					path: '/auth/setup-account',
					session: createAccountSetupSession({
						setupLinkId: validation.link.id,
						accessRequestId: validation.accessRequestId,
						now: now()
					})
				};
			}

			if (!input.setupSession) {
				return {
					state: 'missing',
					message: tokenStateMessage('session-expired')
				};
			}

			const accessRequest = await dependencies.store().getAccessRequest(input.setupSession.accessRequestId);
			if (!accessRequest?.email) {
				return {
					state: 'missing',
					message: tokenStateMessage('missing'),
					clearSession: true
				};
			}

			if (accessRequest.setupCompletedAt) {
				return {
					state: 'used',
					message: tokenStateMessage('access-request-completed'),
					clearSession: true
				};
			}

			if (accessRequest.status !== 'approved') {
				return {
					state: 'access-request-not-approved',
					message: tokenStateMessage('access-request-not-approved'),
					clearSession: true
				};
			}

			const setupLink = await dependencies.store().getSetupLink(input.setupSession.setupLinkId);
			if (!setupLink || setupLink.accessRequestId !== input.setupSession.accessRequestId) {
				return {
					state: 'missing',
					message: tokenStateMessage('missing'),
					clearSession: true
				};
			}

			const setupLinkState = getSetupLinkState(setupLink, now());
			if (setupLinkState !== 'valid') {
				return {
					state: setupLinkState as AccountSetupPageState,
					message: tokenStateMessage(setupLinkState),
					clearSession: true
				};
			}

			return {
				state: 'valid',
				email: accessRequest.email
			};
		},

		async completeSetup(input: AccountSetupCompletionInput): Promise<AccountSetupCompletionResult> {
			if (!input.setupSession) {
				return {
					type: 'failure',
					status: 400,
					error: tokenStateMessage('session-expired'),
					clearSession: true
				};
			}

			const passwordError = validatePassword(input.password);
			if (passwordError) {
				return { type: 'failure', status: 400, error: passwordError };
			}

			if (input.password !== input.confirmPassword) {
				return { type: 'failure', status: 400, error: 'Passwords do not match' };
			}

			const accessRequest = await dependencies.store().getAccessRequest(input.setupSession.accessRequestId);
			const rateLimit = await checkCompletionRateLimit({
				setupLinkId: input.setupSession.setupLinkId,
				accessRequestId: input.setupSession.accessRequestId,
				email: accessRequest?.email ?? null,
				ip: input.clientIp
			});
			if (rateLimit.limited) {
				await audit(
					{
						action: 'account_setup.completion_rate_limited',
						resourceType: 'account_setup_link',
						resourceId: input.setupSession.setupLinkId,
						severity: 'warning',
						details: {
							accessRequestId: input.setupSession.accessRequestId,
							rateLimit: durableRateLimitAuditDetails(rateLimit)
						}
					},
					{
						userId: null,
						ip: input.clientIp,
						userAgent: input.userAgent
					}
				);
				return {
					type: 'failure',
					status: 429,
					error: ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE
				};
			}

			const completion = await dependencies.completion().completeSetupSession({
				setupLinkId: input.setupSession.setupLinkId,
				accessRequestId: input.setupSession.accessRequestId,
				password: input.password
			});

			const setupAuditContext = {
				setupLinkId: input.setupSession.setupLinkId,
				accessRequestId: input.setupSession.accessRequestId,
				clientIp: input.clientIp,
				userAgent: input.userAgent
			};
			const postClaimOutcome =
				(completion.status === 'completed' && 'userId' in completion) ||
				completion.status === 'account-create-failed' ||
				completion.status === 'setup-finalization-failed' ||
				completion.status === 'sign-in-failed';

			if (postClaimOutcome) {
				await auditAccountSetupClaimed(audit, setupAuditContext);
			}

			if (completion.status === 'completed' && 'userId' in completion) {
				await auditAccountSetupCompleted(audit, {
					setupLinkId: input.setupSession.setupLinkId,
					accessRequestId: input.setupSession.accessRequestId,
					userId: completion.userId,
					clientIp: input.clientIp,
					userAgent: input.userAgent
				});
				return { type: 'redirect', path: '/dashboard', clearSession: true };
			}

			if (completion.status === 'account-create-failed') {
				await auditAccountSetupFailed(audit, {
					...setupAuditContext,
					failureCategory: 'account-create-failed'
				});
				const providerPasswordError = mapProviderPasswordError(completion.message);
				if (providerPasswordError) {
					return {
						type: 'failure',
						status: 400,
						error: `${providerPasswordError} Request a fresh setup link, then try again.`,
						clearSession: true
					};
				}
				return { type: 'failure', status: 500, error: claimedSetupFailureMessage(), clearSession: true };
			}

			if (completion.status === 'setup-finalization-failed') {
				await auditAccountSetupFailed(audit, {
					...setupAuditContext,
					failureCategory: 'setup-finalization-failed'
				});
				return { type: 'failure', status: 500, error: claimedSetupFailureMessage(), clearSession: true };
			}

			if (completion.status === 'sign-in-failed') {
				await auditAccountSetupFailed(audit, {
					...setupAuditContext,
					failureCategory: 'sign-in-failed'
				});
				return { type: 'failure', status: 500, error: manualSignInMessage(), clearSession: true };
			}

			await auditAccountSetupFailed(audit, {
				...setupAuditContext,
				failureCategory: completion.status
			});
			return {
				type: 'failure',
				status: 400,
				error: tokenStateMessage(completion.status),
				clearSession: true
			};
		}
	};
}

export function createSupabaseAccountSetupRouteFlow(locals: App.Locals) {
	let providers: {
		store: AccountSetupCompletionStore;
		setupLinks: AccountSetupLinkService;
		completion: AccountSetupCompletionService;
	} | null = null;

	function getProviders() {
		if (!providers) {
			const adminClient = getAdminClient();
			const store = createSupabaseAccountSetupCompletionStore(adminClient);
			const auth = createSupabaseAccountSetupAuthAdapter(adminClient, getSupabaseClient(locals));

			providers = {
				store,
				setupLinks: createAccountSetupLinkService(store),
				completion: createAccountSetupCompletionService(store, auth)
			};
		}

		return providers;
	}

	return createAccountSetupRouteFlow({
		store: () => getProviders().store,
		setupLinks: () => getProviders().setupLinks,
		completion: () => getProviders().completion
	});
}
