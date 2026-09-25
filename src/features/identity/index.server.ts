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
