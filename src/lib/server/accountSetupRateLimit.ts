import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '$lib/server/supabase';

interface AccountSetupRateLimitRpcRow {
	limited: boolean;
	retry_after_ms: number;
}

export const ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE =
	'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.';
export const ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE =
	'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.';

const RENEWAL_WINDOW_MS = 60 * 60 * 1000;
const RENEWAL_MAX_REQUESTS = 3;
const SETUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const SETUP_ATTEMPT_MAX_REQUESTS = 5;

export interface AccountSetupRateLimitStore {
	checkBucket(input: {
		key: string;
		windowMs: number;
		maxRequests: number;
		now: Date;
	}): Promise<{ limited: false } | { limited: true; retryAfterMs: number }>;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function hashDimension(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function createSupabaseAccountSetupRateLimitStore(
	supabase: SupabaseClient = getAdminClient()
): AccountSetupRateLimitStore {
	return {
		async checkBucket(input) {
			const { data, error } = (await supabase.rpc('check_account_setup_rate_limit', {
				p_bucket_key: input.key,
				p_window_seconds: Math.ceil(input.windowMs / 1000),
				p_max_requests: input.maxRequests,
				p_checked_at: input.now.toISOString()
			})) as unknown as {
				data: AccountSetupRateLimitRpcRow[] | AccountSetupRateLimitRpcRow | null;
				error: unknown;
			};

			if (error) {
				throw error;
			}

			const row = Array.isArray(data) ? data[0] : data;
			if (!row) {
				throw new Error('Account setup rate limit check returned no result');
			}

			if (row.limited) {
				return { limited: true, retryAfterMs: row.retry_after_ms };
			}

			return { limited: false };
		}
	};
}

async function checkDimensions(
	keys: string[],
	windowMs: number,
	maxRequests: number,
	now: Date,
	store: AccountSetupRateLimitStore
): Promise<{ limited: false } | { limited: true; retryAfterMs: number }> {
	let retryAfterMs = 0;
	for (const key of keys) {
		const result = await store.checkBucket({ key, windowMs, maxRequests, now });
		if (result.limited) {
			retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs);
		}
	}

	if (retryAfterMs > 0) {
		return { limited: true, retryAfterMs };
	}

	return { limited: false };
}

export function checkAccountSetupRenewalRateLimit(input: {
	email: string;
	ip?: string | null;
	now?: Date;
	store?: AccountSetupRateLimitStore;
}): Promise<{ limited: false } | { limited: true; retryAfterMs: number }> {
	const keys = [`account-setup-renewal:email:${hashDimension(normalizeEmail(input.email))}`];
	if (input.ip) {
		keys.push(`account-setup-renewal:ip:${hashDimension(input.ip)}`);
	}

	return checkDimensions(
		keys,
		RENEWAL_WINDOW_MS,
		RENEWAL_MAX_REQUESTS,
		input.now ?? new Date(),
		input.store ?? createSupabaseAccountSetupRateLimitStore()
	);
}

export function checkAccountSetupCompletionRateLimit(input: {
	setupLinkId: string;
	accessRequestId: string;
	email?: string | null;
	ip?: string | null;
	now?: Date;
	store?: AccountSetupRateLimitStore;
}): Promise<{ limited: false } | { limited: true; retryAfterMs: number }> {
	const keys = [
		`account-setup-completion:link:${input.setupLinkId}`,
		`account-setup-completion:request:${input.accessRequestId}`
	];
	if (input.email) {
		keys.push(`account-setup-completion:email:${hashDimension(normalizeEmail(input.email))}`);
	}
	if (input.ip) {
		keys.push(`account-setup-completion:ip:${hashDimension(input.ip)}`);
	}

	return checkDimensions(
		keys,
		SETUP_ATTEMPT_WINDOW_MS,
		SETUP_ATTEMPT_MAX_REQUESTS,
		input.now ?? new Date(),
		input.store ?? createSupabaseAccountSetupRateLimitStore()
	);
}
