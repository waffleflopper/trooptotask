import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export const ACCOUNT_SETUP_LINK_EXPIRY_DAYS = 14;
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export type AccountSetupLinkValidationStatus = 'valid' | 'expired' | 'revoked' | 'used' | 'missing';

export interface AccountSetupLinkAccessRequest {
	id: string;
	email?: string;
	status: 'pending' | 'approved' | 'rejected';
	setupCompletedAt: Date | string | null;
}

export interface AccountSetupLinkRecord {
	id: string;
	accessRequestId: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
	usedAt: Date | null;
	revokedAt: Date | null;
}

export interface CreateAccountSetupLinkInput {
	accessRequestId: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
}

export interface AccountSetupLinkStore {
	getAccessRequest(id: string): Promise<AccountSetupLinkAccessRequest | null>;
	revokeUnusedLinksForAccessRequest(accessRequestId: string, revokedAt: Date): Promise<void>;
	insertSetupLink(input: CreateAccountSetupLinkInput): Promise<AccountSetupLinkRecord>;
	findByTokenHash(tokenHash: string): Promise<AccountSetupLinkRecord | null>;
	markUsed(id: string, usedAt: Date): Promise<AccountSetupLinkRecord | null>;
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
	used_at: string | null;
	revoked_at: string | null;
}

interface AccessRequestRow {
	id: string;
	email?: string;
	status: 'pending' | 'approved' | 'rejected';
	setup_completed_at: string | null;
}

export type CreateAccountSetupLinkResult =
	| {
			status: 'created';
			accessRequestId: string;
			rawToken: string;
			setupPath: string;
			expiresAt: Date;
			link: AccountSetupLinkRecord;
	  }
	| { status: 'access-request-missing' }
	| { status: 'access-request-not-approved' }
	| { status: 'access-request-completed' };

export type ValidateAccountSetupLinkResult =
	| { status: 'valid'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid'> };

export type ConsumeAccountSetupLinkResult =
	| { status: 'consumed'; accessRequestId: string; link: AccountSetupLinkRecord }
	| { status: Exclude<AccountSetupLinkValidationStatus, 'valid'> };

export interface AccountSetupLinkCleanupResult {
	revokedExpiredUnusedCount: number;
	staleRevokedCount: number;
	completedSetupHistoryCount: number;
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

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

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
		usedAt: row.used_at ? new Date(row.used_at) : null,
		revokedAt: row.revoked_at ? new Date(row.revoked_at) : null
	};
}

function mapAccessRequestRow(row: AccessRequestRow): AccountSetupLinkAccessRequest {
	return {
		id: row.id,
		email: 'email' in row ? (row as AccessRequestRow & { email?: string }).email : undefined,
		status: row.status,
		setupCompletedAt: row.setup_completed_at
	};
}

function throwSupabaseError(error: unknown): asserts error is null | undefined {
	if (error) {
		throw error;
	}
}

function getValidationStatus(link: AccountSetupLinkRecord | null, now: Date): ValidateAccountSetupLinkResult {
	if (!link) {
		return { status: 'missing' };
	}

	if (link.usedAt) {
		return { status: 'used' };
	}

	if (link.revokedAt) {
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
		'Your TroopToTask beta access request was approved.',
		'',
		`Set up your account here: ${input.setupUrl}`,
		'',
		`This setup link expires ${expiresAt} UTC. If it expires, request a fresh setup link from TroopToTask.`
	].join('\n');
	const html = `
		<p>Your TroopToTask beta access request was approved.</p>
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
			const expiresAt = addDays(createdAt, ACCOUNT_SETUP_LINK_EXPIRY_DAYS);

			await store.revokeUnusedLinksForAccessRequest(accessRequestId, createdAt);
			const link = await store.insertSetupLink({
				accessRequestId,
				tokenHash,
				expiresAt,
				createdAt
			});

			return {
				status: 'created',
				accessRequestId,
				rawToken,
				setupPath: `/auth/setup-account?token=${encodeURIComponent(rawToken)}`,
				expiresAt,
				link
			};
		},

		async validateToken(rawToken: string): Promise<ValidateAccountSetupLinkResult> {
			const link = await store.findByTokenHash(hashSetupToken(rawToken));
			return getValidationStatus(link, now());
		},

		async consumeToken(rawToken: string): Promise<ConsumeAccountSetupLinkResult> {
			const validation = await this.validateToken(rawToken);
			if (validation.status !== 'valid') {
				return validation;
			}

			const usedAt = now();
			const consumedLink = await store.markUsed(validation.link.id, usedAt);
			if (!consumedLink) {
				return { status: 'used' };
			}

			return {
				status: 'consumed',
				accessRequestId: validation.accessRequestId,
				link: consumedLink
			};
		},

		async listCleanupEligibleLinks(input: { olderThan: Date }): Promise<AccountSetupLinkRecord[]> {
			return store.listCleanupEligible(input.olderThan);
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
				activeLinkCount,
				deletedAccessRequestCount: 0,
				deletedUserAccountCount: 0
			};
		},

		async revokeUnusedForAccessRequest(accessRequestId: string): Promise<void> {
			await store.revokeUnusedLinksForAccessRequest(accessRequestId, now());
		}
	};
}

export function createSupabaseAccountSetupLinkStore(client: SupabaseClient): AccountSetupLinkStore {
	return {
		async getAccessRequest(id) {
			const { data, error } = await client
				.from('access_requests')
				.select('id, email, status, setup_completed_at')
				.eq('id', id)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapAccessRequestRow(data as AccessRequestRow) : null;
		},

		async revokeUnusedLinksForAccessRequest(accessRequestId, revokedAt) {
			const { error } = await client
				.from('account_setup_links')
				.update({ revoked_at: revokedAt.toISOString() })
				.eq('access_request_id', accessRequestId)
				.is('used_at', null)
				.is('revoked_at', null);

			throwSupabaseError(error);
		},

		async insertSetupLink(input) {
			const { data, error } = await client
				.from('account_setup_links')
				.insert({
					access_request_id: input.accessRequestId,
					token_hash: input.tokenHash,
					expires_at: input.expiresAt.toISOString(),
					created_at: input.createdAt.toISOString(),
					used_at: null,
					revoked_at: null
				})
				.select('id, access_request_id, token_hash, expires_at, created_at, used_at, revoked_at')
				.single();

			throwSupabaseError(error);
			return mapSetupLinkRow(data as AccountSetupLinkRow);
		},

		async findByTokenHash(tokenHash) {
			const { data, error } = await client
				.from('account_setup_links')
				.select('id, access_request_id, token_hash, expires_at, created_at, used_at, revoked_at')
				.eq('token_hash', tokenHash)
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async markUsed(id, usedAt) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ used_at: usedAt.toISOString() })
				.eq('id', id)
				.is('used_at', null)
				.is('revoked_at', null)
				.select('id, access_request_id, token_hash, expires_at, created_at, used_at, revoked_at')
				.maybeSingle();

			throwSupabaseError(error);
			return data ? mapSetupLinkRow(data as AccountSetupLinkRow) : null;
		},

		async listCleanupEligible(cutoff) {
			const cutoffIso = cutoff.toISOString();
			const { data, error } = await client
				.from('account_setup_links')
				.select('id, access_request_id, token_hash, expires_at, created_at, used_at, revoked_at')
				.or(`used_at.lte.${cutoffIso},revoked_at.lte.${cutoffIso},expires_at.lte.${cutoffIso}`);

			throwSupabaseError(error);
			return ((data ?? []) as AccountSetupLinkRow[]).map(mapSetupLinkRow);
		},

		async revokeExpiredUnusedLinks(cutoff, revokedAt) {
			const { data, error } = await client
				.from('account_setup_links')
				.update({ revoked_at: revokedAt.toISOString() })
				.lte('expires_at', cutoff.toISOString())
				.is('used_at', null)
				.is('revoked_at', null)
				.select('id, access_request_id, token_hash, expires_at, created_at, used_at, revoked_at');

			throwSupabaseError(error);
			return ((data ?? []) as AccountSetupLinkRow[]).map(mapSetupLinkRow);
		},

		async countActiveLinks(referenceTime) {
			const { count, error } = await client
				.from('account_setup_links')
				.select('id', { count: 'exact', head: true })
				.gt('expires_at', referenceTime.toISOString())
				.is('used_at', null)
				.is('revoked_at', null);

			throwSupabaseError(error);
			return count ?? 0;
		}
	};
}
