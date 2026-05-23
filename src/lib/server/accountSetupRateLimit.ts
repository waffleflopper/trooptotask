import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	normalizeRateLimitEmail,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE =
	'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.';
export const ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE =
	'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.';

const RENEWAL_WINDOW_MS = 60 * 60 * 1000;
const RENEWAL_MAX_REQUESTS = 3;
const SETUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const SETUP_ATTEMPT_MAX_REQUESTS = 5;

export type AccountSetupRateLimitStore = DurableRateLimitStore;

export function createSupabaseAccountSetupRateLimitStore(supabase?: SupabaseClient): AccountSetupRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for account setup rate limiting`);
	}
	return trimmedValue;
}

export function checkAccountSetupRenewalRateLimit(input: {
	email: string;
	ip?: string | null;
	now?: Date;
	store?: AccountSetupRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const email = requireRateLimitDimension(normalizeRateLimitEmail(input.email), 'email');
	return checkDurableRateLimit({
		namespace: 'account-setup-renewal',
		dimensions: [
			{ name: 'email', value: email },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: RENEWAL_WINDOW_MS,
		maxRequests: RENEWAL_MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabaseAccountSetupRateLimitStore()
	});
}

export function checkAccountSetupCompletionRateLimit(input: {
	setupLinkId: string;
	accessRequestId: string;
	email?: string | null;
	ip?: string | null;
	now?: Date;
	store?: AccountSetupRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const setupLinkId = requireRateLimitDimension(input.setupLinkId, 'setupLinkId');
	const accessRequestId = requireRateLimitDimension(input.accessRequestId, 'accessRequestId');
	return checkDurableRateLimit({
		namespace: 'account-setup-completion',
		dimensions: [
			{ name: 'link', value: setupLinkId },
			{ name: 'request', value: accessRequestId },
			{ name: 'email', value: input.email ? normalizeRateLimitEmail(input.email) : null },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: SETUP_ATTEMPT_WINDOW_MS,
		maxRequests: SETUP_ATTEMPT_MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabaseAccountSetupRateLimitStore()
	});
}
