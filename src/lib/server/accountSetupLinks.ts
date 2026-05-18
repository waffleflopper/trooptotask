import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const ACCOUNT_SETUP_LINK_EXPIRY_DAYS = 14;

export type AccountSetupLinkValidationStatus = 'valid' | 'expired' | 'revoked' | 'used' | 'missing';

export interface AccountSetupLinkAccessRequest {
	id: string;
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

interface AccountSetupLinkServiceOptions {
	now?: () => Date;
	generateToken?: () => string;
}

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
				.select('id, status, setup_completed_at')
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
		}
	};
}
