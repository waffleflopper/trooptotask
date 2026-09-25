// Identity facts admitted by the server hook, never supplied by request input.
export interface AdmittedActor {
	readonly userId: string;
}

export type PendingAuthFlow = 'recovery' | 'invite' | null;

export { sanitizeAuthNextPath } from './redirects';

export interface MfaStatus {
	currentLevel: 'aal1' | 'aal2';
	nextLevel: 'aal1' | 'aal2';
}

export type MfaActionResponse = { ok: true; error?: never } | { ok?: never; error: string };

export interface UserProfile {
	userId: string;
	firstName: string;
	lastName: string;
	rank: string;
}

export interface CurrentUserEmailConfirmation {
	status: 'confirmed' | 'unconfirmed' | 'unavailable';
	email: string | null;
}

export interface AccountSecurityOverview {
	hasMFA: boolean | null;
	currentEmail: string;
	pendingEmail: string | null;
}

export const PLATFORM_ACCESS_REQUEST_APPROVE_ACTION = 'platform.accessRequest.approve';
export const PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION = 'platform.accessRequest.resendSetup';
export const PLATFORM_ACCESS_REQUEST_REJECT_ACTION = 'platform.accessRequest.reject';
export const ORGANIZATION_TRANSFER_OWNERSHIP_ACTION = 'organization.transferOwnership';
export const ORGANIZATION_DELETE_ACTION = 'organization.deleteOrganization';
export const ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION = 'organization.member.inviteHighPrivilege';
export const ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION = 'organization.member.updateHighPrivilege';
export const ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION = 'organization.member.removeHighPrivilege';

export type SensitiveAction =
	| typeof PLATFORM_ACCESS_REQUEST_APPROVE_ACTION
	| typeof PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION
	| typeof PLATFORM_ACCESS_REQUEST_REJECT_ACTION
	| typeof ORGANIZATION_TRANSFER_OWNERSHIP_ACTION
	| typeof ORGANIZATION_DELETE_ACTION
	| typeof ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION
	| typeof ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION
	| typeof ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION;

export type SensitiveActionDecisionReason =
	| 'allowed.recentSession'
	| 'allowed.mfaAssurance'
	| 'denied.unauthenticated'
	| 'denied.suspendedUser'
	| 'denied.staleSession'
	| 'denied.suspensionStatusUnavailable'
	| 'denied.assuranceUnavailable';

export interface SensitiveActionTarget {
	type: string;
	id: string;
}

export interface SensitiveActionDecision {
	allowed: boolean;
	action: SensitiveAction;
	reason: SensitiveActionDecisionReason;
	actorUserId: string | null;
	target?: SensitiveActionTarget;
	currentAssuranceLevel: string | null;
	nextAssuranceLevel: string | null;
	sessionAgeMs: number | null;
	recentSessionWindowMs: number;
	requiresStepUp: boolean;
}

export interface SensitiveActionFailureFields {
	reason: SensitiveActionDecisionReason;
	requiresStepUp: boolean;
	stepUpPath: string | null;
}

export interface SensitiveActionAuthorizeInput {
	action: SensitiveAction;
	actorUserId: string;
	target?: SensitiveActionTarget;
}

export interface SensitiveActionAuthorizer {
	authorize(input: SensitiveActionAuthorizeInput): Promise<SensitiveActionDecision>;
}
