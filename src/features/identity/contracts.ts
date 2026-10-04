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

/** Account facts available to already-admitted platform support operations. */
export interface IdentitySupportAccount {
	id: string;
	email: string | null;
	createdAt: string;
	lastSignInAt: string | null;
	emailConfirmedAt: string | null;
}

export type IdentitySupportAccountListResult =
	| { status: 'ok'; users: IdentitySupportAccount[] }
	| { status: 'auth_error'; message: string };

export type IdentitySupportAccountResult =
	| { status: 'ok'; user: IdentitySupportAccount }
	| { status: 'not_found' }
	| { status: 'auth_error'; message: string };

export interface IdentitySupportSuspension {
	userId: string;
	suspendedAt: string;
	suspendedBy: string;
	reason: string | null;
}

export interface IdentitySupportUserLabel {
	email: string | null;
	firstName: string | null;
	lastName: string | null;
}

export interface IdentityPlatformSupportReader {
	listAuthUsers(): Promise<IdentitySupportAccountListResult>;
	getAuthUser(userId: string): Promise<IdentitySupportAccountResult>;
	searchUsersByEmail(input: {
		query: string;
		maxResults: number;
	}): Promise<Array<{ id: string; email: string | null }>>;
	listSuspendedUserIds(userIds: string[]): Promise<string[]>;
	getSuspensionForUser(userId: string): Promise<IdentitySupportSuspension | null>;
	/** Optional display enrichment; unavailable labels do not confer authority. */
	loadUserLabels(userIds: string[]): Promise<Map<string, IdentitySupportUserLabel>>;
}

export interface IdentityPlatformSuspensionCommands {
	suspendUser(input: { userId: string; suspendedBy: string; reason?: string }): Promise<void>;
	unsuspendUser(userId: string): Promise<void>;
}

export interface IdentityPlatformAccountEmailPort {
	getUserEmailById(
		userId: string
	): Promise<
		{ status: 'found'; email: string } | { status: 'not_found' } | { status: 'provider_error'; message: string }
	>;
	sendPasswordResetEmail(input: {
		userId: string;
		email: string;
		redirectTo: string;
	}): Promise<{ ok: true } | { ok: false; message: string }>;
	sendInviteEmail(input: {
		userId: string;
		email: string;
		redirectTo: string;
	}): Promise<{ ok: true } | { ok: false; message: string }>;
}

export type AccountSetupLinkRevocationReason = 'manual' | 'replaced' | 'cleanup';
export type AccountSetupLinkFailureReason =
	| 'access-request-missing'
	| 'access-request-completed'
	| 'access-request-not-approved'
	| 'account-create-failed'
	| 'completion-tracking-failed'
	| 'reconciled-no-write'
	| 'operator-released';
export type AuthEmailOutboxStatus = 'pending' | 'sent' | 'failed';

export interface AccessRequestSetupLink {
	id: string;
	created_at: string;
	expires_at: string;
	claimed_at: string | null;
	failed_at: string | null;
	failure_reason: AccountSetupLinkFailureReason | null;
	used_at: string | null;
	revoked_at: string | null;
	revocation_reason: AccountSetupLinkRevocationReason | null;
}

export interface AccessRequestAuthEmailOutbox {
	id: string;
	setup_link_id: string;
	status: AuthEmailOutboxStatus;
	attempt_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	sent_at: string | null;
}

export interface IdentitySupportAccessRequestRow {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_details: string | null;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
}

export interface IdentitySupportAccessRequestCommandRow {
	id: string;
	email: string;
	status: 'pending' | 'approved' | 'rejected';
	setup_completed_at: string | null;
}

export interface BlockedOrganizationInvitation {
	id: string;
	organizationId: string;
	email: string;
	blockedAt: string;
}

export type RejectAccessRequestAndBlockInvitationsResult =
	| { status: 'rejected'; blockedInvitations: BlockedOrganizationInvitation[] }
	| { status: 'not_found'; blockedInvitations: [] }
	| { status: 'failed'; message: string; blockedInvitations: [] };

export interface IdentityPlatformAccessRequestStore {
	listAccessRequests(): Promise<IdentitySupportAccessRequestRow[]>;
	getPendingAccessRequestForApproval(accessRequestId: string): Promise<IdentitySupportAccessRequestCommandRow | null>;
	markPendingRequestApproved(input: {
		accessRequestId: string;
		reviewerId: string;
		reviewedAt: Date;
	}): Promise<'approved' | 'not_found'>;
	getApprovedAccessRequestForResend(accessRequestId: string): Promise<IdentitySupportAccessRequestCommandRow | null>;
	rejectPendingAccessRequestAndBlockLinkedInvitations(input: {
		accessRequestId: string;
		actorUserId: string;
	}): Promise<RejectAccessRequestAndBlockInvitationsResult>;
}

export type {
	IdentityPlatformAccountStatistics,
	IdentityPlatformSignupPoint,
	IdentityPlatformDashboardReader
} from './platformDashboardTypes';
