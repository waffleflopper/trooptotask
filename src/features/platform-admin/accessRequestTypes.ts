import type {
	AccessRequestApprovalBasis,
	AccessRequestStatus,
	AccountSetupLinkFailureReason,
	AccountSetupLinkRevocationReason,
	AuthEmailOutboxStatus,
	AccessRequestAuthEmailOutbox,
	AccessRequestSetupLink,
	AccessRequestSetupState,
	SensitiveActionFailureFields,
	IdentitySupportAccessRequestRow,
	IdentityPlatformAccessRequestStore
} from '$features/identity/contracts';
export interface AccessRequestInvitationOrigin {
	link_id: string;
	invitation_id: string;
	organization_id: string;
	organization_name: string;
	inviter_user_id: string;
	inviter_email: string | null;
	inviter_label: string;
	invited_at: string;
	membership_role: 'admin' | 'member';
	membership_role_label: string;
	member_preset: string | null;
	member_preset_label: string | null;
	intended_access_label: string;
}

export type { AccessRequestAuthEmailOutbox, AccessRequestSetupLink, AccessRequestSetupState };

export interface PlatformAccessRequestAdminRow extends IdentitySupportAccessRequestRow {
	invitation_origins: AccessRequestInvitationOrigin[];
}

export interface PlatformAccessRequestAdminItem {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_label: string | null;
	heard_about_details: string | null;
	status: AccessRequestStatus;
	approval_basis: AccessRequestApprovalBasis | null;
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	setup_state: AccessRequestSetupState;
	setup_state_label: string;
	setup_state_detail: string;
	held_setup_claim: { accessRequestId: string; linkId: string; claimedAt: string } | null;
	setup_completed_at_display: string | null;
	setup_link_id: string | null;
	setup_link_created_at: string | null;
	setup_link_expires_at: string | null;
	setup_link_claimed_at: string | null;
	setup_link_failed_at: string | null;
	setup_link_failure_reason: AccountSetupLinkFailureReason | null;
	setup_link_replaced_at: string | null;
	setup_link_revocation_reason: AccountSetupLinkRevocationReason | null;
	has_replaced_setup_link: boolean;
	setup_delivery_id: string | null;
	setup_delivery_status: AuthEmailOutboxStatus | null;
	setup_delivery_attempt_count: number;
	setup_delivery_last_error: string | null;
	setup_delivery_updated_at: string | null;
	setup_delivery_sent_at: string | null;
	invitation_origins: AccessRequestInvitationOrigin[];
	auto_approved: boolean;
	auto_approval_detail: string | null;
	setup_grant_withdrawn: boolean;
}

export interface PlatformAccessRequestAdminList {
	pending: PlatformAccessRequestAdminItem[];
	reviewed: PlatformAccessRequestAdminItem[];
}

export interface PlatformAccessRequestAdminCommand {
	accessRequestId: string;
	actorUserId: string;
	publicOrigin: string;
}

export interface PlatformAccessRequestAdminRescindCommand {
	accessRequestId: string;
	actorUserId: string;
}

export interface PlatformAccessRequestAdminRejectCommand extends PlatformAccessRequestAdminRescindCommand {
	/** Optional operator note, kept in the audit row. */
	reason?: string | null;
}

export type PlatformAccessRequestAdminSendResult =
	| { status: 'sent'; setupDeliveryStatus: 'sent' }
	| { status: 'delivery_failed'; setupDeliveryStatus: 'failed' }
	| { status: 'not_found' | 'already_reviewed' | 'not_approved' | 'setup_completed' | 'concurrent_create' }
	| { status: 'authorization_denied'; message: string; failure: SensitiveActionFailureFields }
	| { status: 'rate_limited'; message: string; retryAfterSeconds: number }
	| { status: 'failed' };

export type PlatformAccessRequestAdminRejectResult =
	| { status: 'rejected' }
	| { status: 'authorization_denied'; message: string; failure: SensitiveActionFailureFields }
	| { status: 'not_found' | 'already_reviewed' | 'failed' };

export type PlatformAccessRequestAdminRescindResult =
	| { status: 'rescinded' }
	| { status: 'authorization_denied'; message: string; failure: SensitiveActionFailureFields }
	| { status: 'not_approved' | 'setup_completed' | 'claim_held' | 'failed' };

export interface PlatformAccessRequestAdministration {
	list(input?: { now?: Date }): Promise<PlatformAccessRequestAdminList>;
	approve(input: PlatformAccessRequestAdminCommand): Promise<PlatformAccessRequestAdminSendResult>;
	resendSetup(input: PlatformAccessRequestAdminCommand): Promise<PlatformAccessRequestAdminSendResult>;
	reject(input: PlatformAccessRequestAdminRejectCommand): Promise<PlatformAccessRequestAdminRejectResult>;
	rescind(input: PlatformAccessRequestAdminRescindCommand): Promise<PlatformAccessRequestAdminRescindResult>;
}

export interface PlatformAccessRequestAdministrationStore extends IdentityPlatformAccessRequestStore {
	listAccessRequests(): Promise<PlatformAccessRequestAdminRow[]>;
}

export interface PlatformAccessRequestAdministrationAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}
