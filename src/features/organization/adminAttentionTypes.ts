/** Pending archive or deletion requests of one kind; a kind with none waiting is left out. */
export interface ApprovalAttention {
	kind: 'archive' | 'deletion';
	count: number;
	oldestCreatedAt: string;
}

/** A pending invitation that has not expired and needs an admin: its email failed, or it lapses within three days. */
export interface InvitationAttention {
	id: string;
	email: string;
	expiresAt: string;
	reason: 'deliveryFailed' | 'expiringSoon';
}

export interface InvitationsAttention {
	/** Pending invitations that have not expired. */
	pending: number;
	attention: readonly InvitationAttention[];
}

/** What an Organization's owners and admins have waiting; the halves read apart, so one failing leaves the other. */
export interface AdminAttention {
	approvals: Promise<readonly ApprovalAttention[]>;
	invitations: Promise<InvitationsAttention>;
}

/** The same two halves once both have been read, as the Dashboard sends them. */
export interface AdminAttentionSnapshot {
	approvals: readonly ApprovalAttention[];
	invitations: readonly InvitationAttention[];
}
