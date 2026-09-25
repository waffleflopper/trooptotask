import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { addUtcDays } from './accountSetupDates';
import { getAdminClient } from '$lib/server/supabase';

export const ACCOUNT_SETUP_LINK_EXPIRY_DAYS = 14;
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const SETUP_LINK_SELECT =
	'id, access_request_id, token_hash, expires_at, created_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason';

export type AccountSetupLinkRevocationReason = 'manual' | 'replaced' | 'cleanup';
export type AccountSetupLinkFailureReason =
	| 'access-request-missing'
	| 'access-request-completed'
	| 'access-request-not-approved'
	| 'account-create-failed'
	| 'completion-tracking-failed'
	| 'operator-released';

type AutomaticAccountSetupLinkFailureReason = Exclude<AccountSetupLinkFailureReason, 'operator-released'>;

export type AccountSetupLinkValidationStatus =
	| 'valid'
	| 'expired'
	| 'revoked'
	| 'replaced'
	| 'used'
	| 'completed'
	| 'claimed'
	| 'failed'
	| 'access-request-not-approved'
	| 'missing';

export interface AccountSetupLinkAccessRequest {
	id: string;
	email?: string;
	name?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	status: 'pending' | 'approved' | 'rejected';
	setupCompletedAt: Date | string | null;
}

export interface AccountSetupLinkRecord {
	id: string;
	accessRequestId: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
	claimedAt: Date | null;
	failedAt: Date | null;
	failureReason: AccountSetupLinkFailureReason | null;
	usedAt: Date | null;
	revokedAt: Date | null;
	revocationReason: AccountSetupLinkRevocationReason | null;
}

export interface CreateAccountSetupLinkInput {
	accessRequestId: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
}

export interface AccountSetupLinkStore {
	getAccessRequest(id: string): Promise<AccountSetupLinkAccessRequest | null>;
	revokeUnusedLinksForAccessRequest(accessRequestId: string, revokedAt: Date): Promise<AccountSetupLinkRecord[]>;
	insertSetupLink(input: CreateAccountSetupLinkInput): Promise<AccountSetupLinkRecord>;
	findByTokenHash(tokenHash: string): Promise<AccountSetupLinkRecord | null>;
	getSetupLink(id: string): Promise<AccountSetupLinkRecord | null>;
	claimSetupLinkForSession(input: {
		setupLinkId: string;
		accessRequestId: string;
		claimedAt: Date;
	}): Promise<ClaimAccountSetupLinkResult>;
	markCompleted(id: string, completedAt: Date): Promise<AccountSetupLinkRecord | null>;
	markFailed(
		id: string,
		failedAt: Date,
		failureReason: AutomaticAccountSetupLinkFailureReason
	): Promise<AccountSetupLinkRecord | null>;
	listCleanupEligible(cutoff: Date): Promise<AccountSetupLinkRecord[]>;
	revokeExpiredUnusedLinks(cutoff: Date, revokedAt: Date): Promise<AccountSetupLinkRecord[]>;
	countActiveLinks(referenceTime: Date): Promise<number>;
}

interface AccountSetupLinkRow {
	id: string;
	access_request_id: string;
	token_hash: string;
	expires_at: string;
	created_at: string;
	claimed_at: string | null;
	failed_at: string | null;
	failure_reason: AccountSetupLinkFailureReason | null;
	used_at: string | null;
	revoked_at: string | null;
	revocation_reason: AccountSetupLinkRevocationReason | null;
}

interface AccessRequestRow {
	id: string;
	email?: string;
	name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	status: 'pending' | 'approved' | 'rejected';
	setup_completed_at: string | null;
}

interface ClaimAccountSetupLinkRpcRow {
	claim_status: ClaimAccountSetupLinkResult['status'] | 'completed' | null;
	setup_link_id: string | null;
	access_request_id: string | null;
	expires_at: string | null;
	created_at: string | null;
	claimed_at: string | null;
	failed_at: string | null;
	failure_reason: AccountSetupLinkFailureReason | null;
	used_at: string | null;
	revoked_at: string | null;
	revocation_reason: AccountSetupLinkRevocationReason | null;
}

export type CreateAccountSetupLinkResult =
	| {
			status: 'created';
			accessRequestId: string;
			rawToken: string;
			setupPath: string;
			expiresAt: Date;
			link: AccountSetupLinkRecord;
			revokedLinks: AccountSetupLinkRecord[];
	  }
	| { status: 'access-request-missing' }
	| { status: 'access-request-not-approved' }
	| { status: 'access-request-completed' }
	| { status: 'concurrent-create' };

export type ValidateAccountSetupLinkResult =
	| { status: 'valid'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid'> };

export type ClaimAccountSetupLinkResult =
	| { status: 'claim-started'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid'> | 'access-request-completed' | 'claim-in-progress' };

export type CompleteClaimedAccountSetupLinkResult =
	| { status: 'completed'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid' | 'claimed'> };

export type FailClaimedAccountSetupLinkResult =
	| { status: 'failed'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid' | 'claimed'> };

export interface AccountSetupLinkCleanupResult {
	revokedExpiredUnusedCount: number;
	staleRevokedCount: number;
	completedSetupHistoryCount: number;
	failedSetupHistoryCount: number;
	activeLinkCount: number;
	deletedAccessRequestCount: 0;
	deletedUserAccountCount: 0;
}

interface AccountSetupLinkServiceOptions {
	now?: () => Date;
	generateToken?: () => string;
}

interface SendAccountSetupLinkEmailInput {
	email: string;
	setupUrl: string;
	expiresAt: Date;
}

interface ResendEmailResponse {
	ok: boolean;
	status: number;
	text(): Promise<string>;
}

type ResendFetch = (input: string, init: RequestInit) => Promise<ResendEmailResponse>;

function generateSetupToken(): string {
	return randomBytes(32).toString('base64url');
}

function hashSetupToken(rawToken: string): string {
	return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function mapSetupLinkRow(row: AccountSetupLinkRow): AccountSetupLinkRecord {
	return {
		id: row.id,
		accessRequestId: row.access_request_id,
		tokenHash: row.token_hash,
		expiresAt: new Date(row.expires_at),
		createdAt: new Date(row.created_at),
		claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
		failedAt: row.failed_at ? new Date(row.failed_at) : null,
		failureReason: row.failure_reason,
		usedAt: row.used_at ? new Date(row.used_at) : null,
		revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
		revocationReason: row.revocation_reason
	};
}

function mapAccessRequestRow(row: AccessRequestRow): AccountSetupLinkAccessRequest {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		firstName: row.first_name,
		lastName: row.last_name,
		status: row.status,
		setupCompletedAt: row.setup_completed_at
	};
}

function mapClaimRpcRow(row: ClaimAccountSetupLinkRpcRow): ClaimAccountSetupLinkResult {
	const status = row.claim_status === 'completed' ? 'used' : row.claim_status;
	if (!status || status !== 'claim-started') {
		return { status: status ?? 'failed' } as ClaimAccountSetupLinkResult;
	}

	if (!row.setup_link_id || !row.access_request_id || !row.expires_at || !row.created_at) {
		return { status: 'failed' };
	}

	return {
		status: 'claim-started',
		accessRequestId: row.access_request_id,
		link: mapSetupLinkRow({
			id: row.setup_link_id,
			access_request_id: row.access_request_id,
			// The claim RPC intentionally excludes token_hash so raw setup-token material stays database-only.
			token_hash: '',
			expires_at: row.expires_at,
			created_at: row.created_at,
			claimed_at: row.claimed_at,
			failed_at: row.failed_at,
			failure_reason: row.failure_reason,
			used_at: row.used_at,
			revoked_at: row.revoked_at,
			revocation_reason: row.revocation_reason
		})
	};
}

function throwSupabaseError(error: unknown): asserts error is null | undefined {
	if (error) {
		throw error;
	}
}

function isUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const candidate = error as { code?: unknown; message?: unknown };
	return (
		candidate.code === '23505' ||
		(typeof candidate.message === 'string' &&
			candidate.message.includes('account_setup_links_one_active_per_request_idx'))
	);
}

function getValidationStatus(link: AccountSetupLinkRecord | null, now: Date): ValidateAccountSetupLinkResult {
	if (!link) {
		return { status: 'missing' };
	}

	if (link.usedAt) {
		return { status: 'completed' };
	}

	if (link.failedAt) {
		return { status: 'failed' };
	}

	if (link.claimedAt) {
		return { status: 'claimed' };
	}

	if (link.revokedAt) {
		if (link.revocationReason === 'replaced') {
			return { status: 'replaced' };
		}
		return { status: 'revoked' };
	}

	if (link.expiresAt <= now) {
		return { status: 'expired' };
	}

	return { status: 'valid', accessRequestId: link.accessRequestId, link };
}

function formatEmailDate(date: Date): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	}).format(date);
}

function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function assertSafeSetupUrl(setupUrl: string): void {
	const url = new URL(setupUrl);
	const isLocalHttp =
		url.protocol === 'http:' &&
		(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');

	if (url.protocol !== 'https:' && !isLocalHttp) {
		throw new Error('Account setup email URL must use HTTPS outside local development');
	}
}

function buildAccountSetupEmail(input: SendAccountSetupLinkEmailInput): {
	subject: string;
	text: string;
	html: string;
} {
	assertSafeSetupUrl(input.setupUrl);
	const expiresAt = formatEmailDate(input.expiresAt);
	const subject = 'Set up your TroopToTask account';
	const setupUrlAttribute = escapeHtmlAttribute(input.setupUrl);
	const text = [
		'Your TroopToTask access request was approved.',
		'',
		`Set up your account here: ${input.setupUrl}`,
		'',
		`This setup link expires ${expiresAt} UTC. If it expires, request a fresh setup link from TroopToTask.`
	].join('\n');
	const html = `
		<p>Your TroopToTask access request was approved.</p>
		<p><a href="${setupUrlAttribute}">Set up your account</a></p>
		<p>This setup link expires ${expiresAt} UTC. If it expires, request a fresh setup link from TroopToTask.</p>
	`;

	return { subject, text, html };
}

export async function sendAccountSetupLinkEmail(
	input: SendAccountSetupLinkEmailInput,
	fetchImpl: ResendFetch = fetch
): Promise<void> {
	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL;

	if (!apiKey || !from) {
		throw new Error('Account setup email delivery is not configured');
	}

	const email = buildAccountSetupEmail(input);
	const response = await fetchImpl(RESEND_EMAILS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to: [input.email],
			subject: email.subject,
			text: email.text,
			html: email.html
		})
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`Account setup email delivery failed with status ${response.status}${body ? `: ${body}` : ''}`);
	}
}

export function createAccountSetupLinkService(
	store: AccountSetupLinkStore,
	options: AccountSetupLinkServiceOptions = {}
) {
	const now = options.now ?? (() => new Date());
	const generateToken = options.generateToken ?? generateSetupToken;

	return {
		async createForAccessRequest(accessRequestId: string): Promise<CreateAccountSetupLinkResult> {
			const accessRequest = await store.getAccessRequest(accessRequestId);
			if (!accessRequest) {
				return { status: 'access-request-missing' };
			}

			if (accessRequest.status !== 'approved') {
				return { status: 'access-request-not-approved' };
			}

			if (accessRequest.setupCompletedAt) {
				return { status: 'access-request-completed' };
			}

			const createdAt = now();
			const rawToken = generateToken();
			const tokenHash = hashSetupToken(rawToken);
			const expiresAt = addUtcDays(createdAt, ACCOUNT_SETUP_LINK_EXPIRY_DAYS);

			let link: AccountSetupLinkRecord;
			let revokedLinks: AccountSetupLinkRecord[];
			try {
				revokedLinks = await store.revokeUnusedLinksForAccessRequest(accessRequestId, createdAt);
				link = await store.insertSetupLink({
					accessRequestId,
					tokenHash,
					expiresAt,
					createdAt
				});
			} catch (error) {
				if (isUniqueConstraintError(error)) {
					return { status: 'concurrent-create' };
				}
				throw error;
			}

			return {
				status: 'created',
				accessRequestId,
				rawToken,
				setupPath: `/auth/setup-account?token=${encodeURIComponent(rawToken)}`,
				expiresAt,
				link,
				revokedLinks
			};
		},

		async validateToken(rawToken: string): Promise<ValidateAccountSetupLinkResult> {
			const link = await store.findByTokenHash(hashSetupToken(rawToken));
			const validation = getValidationStatus(link, now());
			if (validation.status !== 'valid') {
				return validation;
			}

			const accessRequest = await store.getAccessRequest(validation.accessRequestId);
			if (!accessRequest) {
				return { status: 'missing' };
			}

			if (accessRequest.setupCompletedAt) {
				return { status: 'completed' };
			}

			if (accessRequest.status !== 'approved') {
				return { status: 'access-request-not-approved' };
			}

			return validation;
		},

		async markClaimCompleted(linkId: string): Promise<CompleteClaimedAccountSetupLinkResult> {
			const completedAt = now();
			const completedLink = await store.markCompleted(linkId, completedAt);
			if (!completedLink) {
				return { status: 'used' };
			}

			return {
				status: 'completed',
				accessRequestId: completedLink.accessRequestId,
				link: completedLink
			};
		},

		async markClaimFailed(
			linkId: string,
			failureReason: AutomaticAccountSetupLinkFailureReason
		): Promise<FailClaimedAccountSetupLinkResult> {
			const failedAt = now();
			const failedLink = await store.markFailed(linkId, failedAt, failureReason);
			if (!failedLink) {
				return { status: 'used' };
			}

			return {
				status: 'failed',
				accessRequestId: failedLink.accessRequestId,
				link: failedLink
			};
		},

		async cleanupStaleLinks(input: { olderThan?: Date } = {}): Promise<AccountSetupLinkCleanupResult> {
			const cleanupAt = now();
			const cutoff = input.olderThan ?? cleanupAt;
			const revokedExpiredUnusedLinks = await store.revokeExpiredUnusedLinks(cutoff, cleanupAt);
			const cleanupEligibleLinks = await store.listCleanupEligible(cutoff);
			const activeLinkCount = await store.countActiveLinks(cutoff);

			return {
				revokedExpiredUnusedCount: revokedExpiredUnusedLinks.length,
				staleRevokedCount: cleanupEligibleLinks.filter((link) => link.revokedAt).length,
				completedSetupHistoryCount: cleanupEligibleLinks.filter((link) => link.usedAt).length,
				failedSetupHistoryCount: cleanupEligibleLinks.filter((link) => link.failedAt).length,
				activeLinkCount,
				deletedAccessRequestCount: 0,
				deletedUserAccountCount: 0
			};
		}
	};
}

export function createSupabaseAccountSetupLinkStore(client: SupabaseClient): AccountSetupLinkStore {
	return {
		async getAccessRequest(id) {
			const { data, error } = await client
				.from('access_requests')
				.select('id, email, name, first_name, last_name, status, setup_completed_at')
				.eq('id', id)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
		},

		async revokeUnusedLinksForAccessRequest(accessRequestId, revokedAt) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ revoked_at: revokedAt.toISOString(), revocation_reason: 'replaced' })
				.eq('access_request_id', accessRequestId)
				.is('claimed_at', null)
				.is('used_at', null)
				.is('revoked_at', null)
				.select(SETUP_LINK_SELECT);

			throwSupabaseError(error);
			return ((data ?? []) as AccountSetupLinkRow[]).map(mapSetupLinkRow);
		},

		async insertSetupLink(input) {
			const { data, error } = await client
				.from('account_setup_links')
				.insert({
					access_request_id: input.accessRequestId,
					token_hash: input.tokenHash,
					expires_at: input.expiresAt.toISOString(),
					created_at: input.createdAt.toISOString(),
					claimed_at: null,
					failed_at: null,
					failure_reason: null,
					used_at: null,
					revoked_at: null,
					revocation_reason: null
				})
				.select(SETUP_LINK_SELECT)
				.single();

			throwSupabaseError(error);
			return mapSetupLinkRow(data as AccountSetupLinkRow);
		},

		async findByTokenHash(tokenHash) {
			const { data, error } = await client
				.from('account_setup_links')
				.select(SETUP_LINK_SELECT)
				.eq('token_hash', tokenHash)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async getSetupLink(id) {
			const { data, error } = await client
				.from('account_setup_links')
				.select(SETUP_LINK_SELECT)
				.eq('id', id)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async claimSetupLinkForSession(input) {
			const { data, error } = await client
				.rpc('claim_account_setup_link_for_session', {
					p_setup_link_id: input.setupLinkId,
					p_access_request_id: input.accessRequestId,
					p_claimed_at: input.claimedAt.toISOString()
				})
				.single<ClaimAccountSetupLinkRpcRow>();

			throwSupabaseError(error);
			return mapClaimRpcRow(data as ClaimAccountSetupLinkRpcRow);
		},

		async markCompleted(id, completedAt) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ used_at: completedAt.toISOString() })
				.eq('id', id)
				.not('claimed_at', 'is', null)
				.is('failed_at', null)
				.is('used_at', null)
				.is('revoked_at', null)
				.select(SETUP_LINK_SELECT)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async markFailed(id, failedAt, failureReason) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ failed_at: failedAt.toISOString(), failure_reason: failureReason })
				.eq('id', id)
				.not('claimed_at', 'is', null)
				.is('failed_at', null)
				.is('used_at', null)
				.select(SETUP_LINK_SELECT)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async listCleanupEligible(cutoff) {
			const cutoffIso = cutoff.toISOString();
			const { data, error } = await client
				.from('account_setup_links')
				.select(SETUP_LINK_SELECT)
				.or(
					`used_at.lte.${cutoffIso},revoked_at.lte.${cutoffIso},failed_at.lte.${cutoffIso},expires_at.lte.${cutoffIso}`
				);

			throwSupabaseError(error);
			return ((data ?? []) as AccountSetupLinkRow[]).map(mapSetupLinkRow);
		},

		async revokeExpiredUnusedLinks(cutoff, revokedAt) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ revoked_at: revokedAt.toISOString(), revocation_reason: 'cleanup' })
				.lte('expires_at', cutoff.toISOString())
				.is('claimed_at', null)
				.is('used_at', null)
				.is('revoked_at', null)
				.select(SETUP_LINK_SELECT);

			throwSupabaseError(error);
			return ((data ?? []) as AccountSetupLinkRow[]).map(mapSetupLinkRow);
		},

		async countActiveLinks(referenceTime) {
			const { count, error } = await client
				.from('account_setup_links')
				.select('id', { count: 'exact', head: true })
				.gt('expires_at', referenceTime.toISOString())
				.is('claimed_at', null)
				.is('failed_at', null)
				.is('used_at', null)
				.is('revoked_at', null);

			throwSupabaseError(error);
			return count ?? 0;
		}
	};
}

export function cleanupAccountSetupLinks(): Promise<AccountSetupLinkCleanupResult> {
	return createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(getAdminClient())).cleanupStaleLinks();
}
