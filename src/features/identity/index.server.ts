// Current server transport operations for request admission and logout.
// Provider sessions stay at this Identity/delivery edge; they are not feature contracts.
export { readIdentitySession } from './requestSession.server';
export { signOutIdentity } from './signOut.server';
export { loginIdentity } from './login.server';

export { readIdentityAdmission } from './admission.server';
export {
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	getPublicPageUser,
	setCompletedAuthFlowCookie,
	setPendingAuthFlowCookie
} from './mfaGate.server';
export { createIdentityAuthorization } from './authorization.server';
export { readIdentityMfaStatus, verifyIdentityMfa } from './mfa.server';
export {
	enrollIdentityMfa,
	verifyIdentityMfaEnrollment,
	cancelIdentityMfaEnrollment,
	disableIdentityMfa
} from './mfaManagement.server';

export { loadUserProfile, parseUserProfileForm, upsertUserProfile } from './userProfile.server';
export { verifyCurrentUserEmailConfirmation } from './currentUserEmailConfirmation.server';

export { checkSessionAssurance } from './sessionAssurance.server';
export { readIdentitySecurity, updateIdentityEmail } from './accountSecurity.server';

export { getAuthCookieOptions } from './authCookies.server';
export {
	createSupabaseSensitiveActionAuthorizer,
	sensitiveActionDecisionAuditDetails,
	sensitiveActionDenialMessage,
	sensitiveActionFailureFields,
	throwSensitiveActionFailure
} from './sensitiveActionAuthorizer.server';
export { confirmSensitiveIdentity } from './confirmSensitiveIdentity.server';

export { passwordAttempt, passwordCompletionState, type PasswordAttempt } from './passwordCompletion.server';

export { updateIdentityPassword } from './updatePassword.server';
export { sendPlatformAuthEmail } from '$lib/server/authEmailDelivery';
export { requestPublicPasswordRecovery } from './passwordRecoveryRequest.server';
export { FORGOT_PASSWORD_RATE_LIMIT_MESSAGE } from './forgotPasswordRateLimit.server';
export { createPublicAccessRequestSetupDeliveryService } from './accessRequestSetupDelivery.server';
export { createSupabaseAccountSetupRouteFlow } from './accountSetupRouteFlow.server';
export {
	readAccountSetupSessionCookie,
	setAccountSetupSessionCookie,
	clearAccountSetupSessionCookie
} from './accountSetupSessions.server';
export {
	ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE,
	checkAccountSetupRenewalRateLimit
} from './accountSetupRateLimit.server';
export {
	createAccountSetupLinkIssuance,
	redactProviderError,
	type AccountSetupLinkIssuanceCreator,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkIssuanceOrigin,
	type AccountSetupLinkIssuanceResult,
	type AccountSetupLinkNotCreatedReason
} from './accountSetupLinkIssuance.server';
export { createSupabaseAccountSetupLinkIssuancePorts } from './accountSetupLinkIssuanceSupabase.server';
export {
	cleanupAccountSetupLinks,
	type AccountSetupLinkFailureReason,
	type AccountSetupLinkRecord,
	type AccountSetupLinkRevocationReason,
	type CreateAccountSetupLinkResult
} from './accountSetupLinks.server';
export {
	classifyAccessRequestSetupState,
	findLatestAccessRequestSetupDelivery,
	normalizeAccessRequestSetupDeliveries,
	normalizeAccessRequestSetupLinks,
	resolveAccessRequestSetupState,
	ACCOUNT_SETUP_RECOVERY_LINK_LABEL,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type AccessRequestSetupStateSource
} from './accessRequestSetupState.server';
export type { AccessRequestSetupState } from './contracts';
export {
	type AuthEmailOutboxRecord,
	type AuthEmailOutboxStatus,
	type SendAccountSetupOutboxDeliveryResult
} from './authEmailOutbox.server';
export {
	ACCESS_REQUEST_RATE_LIMIT_MESSAGE,
	checkAccessRequestSubmissionRateLimit
} from './accessRequestRateLimit.server';
