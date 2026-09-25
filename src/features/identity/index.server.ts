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
	isMfaStepUpRequired,
	sanitizePendingAuthFlow,
	setPendingAuthFlowCookie,
	shouldRedirectIncompleteAuthSession
} from './mfaGate.server';
export { isPublicRoute } from './publicRoutes.server';
export { createIdentityAuthorization } from './authorization.server';
export { establishIdentitySession } from './establishSession.server';
export { readIdentityMfaStatus, verifyIdentityMfa } from './mfa.server';
export {
	enrollIdentityMfa,
	verifyIdentityMfaEnrollment,
	cancelIdentityMfaEnrollment,
	disableIdentityMfa
} from './mfaManagement.server';

export { loadUserProfile, parseUserProfileForm, upsertUserProfile } from './userProfile.server';
export { verifyCurrentUserEmailConfirmation } from './currentUserEmailConfirmation.server';

export { verifyPasswordProof } from './passwordProof.server';
export { checkSessionAssurance } from './sessionAssurance.server';
export { readIdentitySecurity, updateIdentityEmail } from './accountSecurity.server';
