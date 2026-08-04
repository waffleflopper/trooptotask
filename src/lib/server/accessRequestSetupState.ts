import type { AccountSetupLinkFailureReason, AccountSetupLinkRevocationReason } from '$lib/server/accountSetupLinks';
import type { AuthEmailOutboxStatus } from '$lib/server/authEmailOutbox';

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

/**
 * The label on the invitation email's recovery link to `/auth/renew-invite`.
 *
 * Fixed, not stylistic: the organization members screen instructs an admin to point the invitee
 * at this link by name, so the two must stay in step (ADR 0012).
 */
export const ACCOUNT_SETUP_RECOVERY_LINK_LABEL = "Didn't get your setup link?";

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

export interface AccessRequestSetupStateSource {
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
}

/** Setup links for one Access Request, newest first. */
export function normalizeAccessRequestSetupLinks(
	links: AccessRequestSetupStateSource['account_setup_links']
): AccessRequestSetupLink[] {
	if (!links) return [];
	const normalized = Array.isArray(links) ? links : [links];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Setup-email outbox rows for one Access Request, newest first. */
export function normalizeAccessRequestSetupDeliveries(
	rows: AccessRequestSetupStateSource['auth_email_outbox']
): AccessRequestAuthEmailOutbox[] {
	if (!rows) return [];
	const normalized = Array.isArray(rows) ? rows : [rows];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** The delivery row for the newest setup link, falling back to the newest delivery when no link exists. */
export function findLatestAccessRequestSetupDelivery(
	links: AccessRequestSetupLink[],
	deliveries: AccessRequestAuthEmailOutbox[]
): AccessRequestAuthEmailOutbox | null {
	const latestLink = links[0] ?? null;
	if (!latestLink) return deliveries[0] ?? null;
	return deliveries.find((delivery) => delivery.setup_link_id === latestLink.id) ?? null;
}

/**
 * Classifies where one Access Request has reached in account setup, from its newest link and
 * that link's delivery row.
 *
 * This is the single source of truth for setup state. The platform-admin read model adds labels
 * and link detail on top; the organization-scoped invitation lookup collapses it to
 * organization-facing vocabulary. Neither re-derives it.
 */
export function classifyAccessRequestSetupState(input: {
	setupCompletedAt: string | null;
	latestLink: AccessRequestSetupLink | null;
	latestDelivery: AccessRequestAuthEmailOutbox | null;
	now: Date;
}): AccessRequestSetupState {
	const { latestLink, latestDelivery } = input;

	if (input.setupCompletedAt || latestLink?.used_at) return 'completed';
	if (!latestLink) return 'not_sent';
	if (latestLink.failed_at) return 'failed';
	if (latestLink.claimed_at) return 'claimed';
	if (latestLink.revoked_at) return 'replaced';
	if (new Date(latestLink.expires_at) <= input.now) return 'expired';
	if (latestDelivery?.status === 'failed') return 'delivery_failed';
	if (latestDelivery?.status === 'pending') return 'delivery_pending';
	return 'pending';
}

/** {@link classifyAccessRequestSetupState} over raw joined rows. */
export function resolveAccessRequestSetupState(
	source: AccessRequestSetupStateSource,
	now: Date
): AccessRequestSetupState {
	const links = normalizeAccessRequestSetupLinks(source.account_setup_links);
	const deliveries = normalizeAccessRequestSetupDeliveries(source.auth_email_outbox);

	return classifyAccessRequestSetupState({
		setupCompletedAt: source.setup_completed_at,
		latestLink: links[0] ?? null,
		latestDelivery: findLatestAccessRequestSetupDelivery(links, deliveries),
		now
	});
}
