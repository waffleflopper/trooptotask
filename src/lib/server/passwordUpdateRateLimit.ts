import type { SupabaseClient } from '@supabase/supabase-js';
import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	durableRateLimitAuditDetails,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from './durableRateLimit';

export const PASSWORD_UPDATE_RATE_LIMIT_MESSAGE = 'Too many password update attempts. Please wait before trying again.';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

export type PasswordUpdateRateLimitStore = DurableRateLimitStore;

export function createSupabasePasswordUpdateRateLimitStore(supabase?: SupabaseClient): PasswordUpdateRateLimitStore {
	return createSupabaseDurableRateLimitStore(supabase);
}

function requireRateLimitDimension(value: string, name: string): string {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		throw new Error(`${name} is required for password update rate limiting`);
	}
	return trimmedValue;
}

export function checkPasswordUpdateRateLimit(input: {
	userId: string;
	ip?: string | null;
	now?: Date;
	store?: PasswordUpdateRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const userId = requireRateLimitDimension(input.userId, 'userId');
	return checkDurableRateLimit({
		namespace: 'password-update',
		dimensions: [
			{ name: 'user', value: userId },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: WINDOW_MS,
		maxRequests: MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabasePasswordUpdateRateLimitStore()
	});
}

export function passwordUpdateRateLimitAuditDetails(decision: DurableRateLimitDecision): Record<string, unknown> {
	return durableRateLimitAuditDetails(decision);
}
