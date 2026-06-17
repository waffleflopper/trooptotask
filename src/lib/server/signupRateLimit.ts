import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	normalizeRateLimitEmail,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const SIGNUP_RATE_LIMIT_MESSAGE = 'Too many account creation attempts. Please wait before trying again.';

const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_REQUESTS = 5;

export type SignupRateLimitStore = DurableRateLimitStore;

export function createSupabaseSignupRateLimitStore(supabase?: SupabaseClient): SignupRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for signup rate limiting`);
	}
	return trimmedValue;
}

export function checkSignupRateLimit(input: {
	email: string;
	ip?: string | null;
	now?: Date;
	store?: SignupRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const email = requireRateLimitDimension(normalizeRateLimitEmail(input.email), 'email');

	return checkDurableRateLimit({
		namespace: 'signup',
		dimensions: [
			{ name: 'email', value: email },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: SIGNUP_WINDOW_MS,
		maxRequests: SIGNUP_MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabaseSignupRateLimitStore()
	});
}
