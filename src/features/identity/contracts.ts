// Identity facts admitted by the server hook, never supplied by request input.
export interface AdmittedActor {
	readonly userId: string;
}

export type PendingAuthFlow = 'recovery' | 'invite' | null;

export const ACCESS_REQUEST_SETUP_RENEWAL_DAYS = 90;
export { addUtcDays } from './accountSetupDates';

export const ACCESS_REQUEST_HEARD_ABOUT_OPTIONS = [
	{ value: 'word_of_mouth', label: 'Word of mouth' },
	{ value: 'unit_peer', label: 'Someone in my unit' },
	{ value: 'search_engine', label: 'Search engine (Google, Bing, etc.)' },
	{ value: 'social_media', label: 'Social media' },
	{ value: 'reddit', label: 'Reddit' },
	{ value: 'army_community', label: 'Army community or forum' },
	{ value: 'other', label: 'Other' }
] as const;

export type AccessRequestHeardAbout = (typeof ACCESS_REQUEST_HEARD_ABOUT_OPTIONS)[number]['value'];

export function isAccessRequestHeardAbout(value: string): value is AccessRequestHeardAbout {
	return ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.some((option) => option.value === value);
}

export function getAccessRequestHeardAboutLabel(value: string | null | undefined): string | null {
	return ACCESS_REQUEST_HEARD_ABOUT_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

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

export type PasswordCompletionState = 'started' | 'failed' | 'pending' | 'complete' | 'expired' | 'unavailable' | null;

export type AccessRequestSetupState =
	| 'not_sent'
	| 'delivery_failed'
	| 'delivery_pending'
	| 'claimed'
	| 'pending'
	| 'expired'
	| 'replaced'
	| 'failed'
	| 'completed';
