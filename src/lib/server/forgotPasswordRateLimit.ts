import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	normalizeRateLimitEmail,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const FORGOT_PASSWORD_RATE_LIMIT_MESSAGE =
	'Too many password recovery requests. Please wait before trying again.';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 3;

export type ForgotPasswordRateLimitStore = DurableRateLimitStore;

export function createSupabaseForgotPasswordRateLimitStore(supabase?: SupabaseClient): ForgotPasswordRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for forgot-password rate limiting`);
	}
	return trimmedValue;
}

export function checkForgotPasswordRateLimit(input: {
	email: string;
	ip?: string | null;
	now?: Date;
	store?: ForgotPasswordRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const email = requireRateLimitDimension(normalizeRateLimitEmail(input.email), 'email');
	return checkDurableRateLimit({
		namespace: 'forgot-password',
		dimensions: [
			{ name: 'email', value: email },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: WINDOW_MS,
		maxRequests: MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabaseForgotPasswordRateLimitStore()
	});
}

export function forgotPasswordRateLimitAuditDetails(decision: DurableRateLimitDecision): Record<string, unknown> {
	return durableRateLimitAuditDetails(decision);
}
