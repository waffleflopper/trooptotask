// Current server transport operations for request admission and logout.
// Provider sessions stay at this Identity/delivery edge; they are not feature contracts.
export { readIdentitySession } from './requestSession.server';
export { makePublicAppUrl } from './publicAppOrigin.server';
export { findUserEmailIdentityByEmail } from './userEmailIdentities.server';
export { findInvitationRecipientAccount, normalizeUserEmailIdentity } from './invitationRecipientAccount.server';
export { signOutIdentity } from './signOut.server';
export { loginIdentity } from './login.server';

export { readIdentityAdmission } from './admission.server';
export { getIdentityViewer } from './viewer.server';
export {
	getIdentitySessionScope,
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	getPublicPageUser,
	setCompletedAuthFlowCookie,
	setPendingAuthFlowCookie
} from './mfaGate.server';
export { readIdentityMfaStatus, verifyIdentityMfa } from './mfa.server';
export { MFA_CODE_RATE_LIMIT_MESSAGE } from './mfaCodeRateLimit.server';
export {
	enrollIdentityMfa,
	verifyIdentityMfaEnrollment,
	cancelIdentityMfaEnrollment,
	disableIdentityMfa
} from './mfaManagement.server';

export { loadUserProfile, parseUserProfileForm, upsertUserProfile } from './userProfile.server';
export {
	loadUserOrgPreferences,
	patchUserOrgPreferences,
	loadGettingStartedDismissed,
	setGettingStartedDismissed
} from './accountPreferences.server';
export { verifyCurrentUserEmailConfirmation } from './currentUserEmailConfirmation.server';

export { checkSessionAssurance } from './sessionAssurance.server';
export { readAccountSuspension } from './accountSuspension.server';
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

export {
	passwordAttempt,
	passwordCompletionState,
	recoveryPasswordPageState,
	type PasswordAttempt
} from './passwordCompletion.server';

export { updateIdentityPassword } from './updatePassword.server';
export { getAuthConfirmState, getAuthConfirmRedirectTo } from './authConfirm.server';
export { confirmAuthLink } from './confirmAuthLink.server';
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
	isSetupGrantWithdrawn,
	normalizeAccessRequestSetupDeliveries,
	normalizeAccessRequestSetupLinks,
	resolveAccessRequestSetupState,
	ACCOUNT_SETUP_RECOVERY_LINK_LABEL,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type AccessRequestSetupStateSource
} from './accessRequestSetupState.server';
export type { AccessRequestApprovalBasis, AccessRequestSetupState, AccessRequestStatus } from './contracts';
export {
	type AuthEmailOutboxRecord,
	type AuthEmailOutboxStatus,
	type SendAccountSetupOutboxDeliveryResult
} from './authEmailOutbox.server';
export {
	ACCESS_REQUEST_RATE_LIMIT_MESSAGE,
	checkAccessRequestSubmissionRateLimit
} from './accessRequestRateLimit.server';

export { createIdentityPlatformSupportReader } from './platformSupportReader.server';
export { createIdentityPlatformSuspensionCommands } from './platformSuspensionCommands.server';
export { createIdentityPlatformAccountEmailPort } from './platformAccountEmail.server';
export { createIdentityPlatformAccessRequestStore } from './platformAccessRequests.server';

export { createSupabaseIdentityExportReader } from './organizationExportRead.server';
export { createIdentityPlatformDashboardReader } from './platformDashboardReader.server';
