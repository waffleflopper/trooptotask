import {
	checkDurableRateLimit,
	durableRateLimitAuditDetails,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from '$lib/access/index.server';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

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
	store?: DurableRateLimitStore;
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
		store: input.store
	});
}

export function passwordUpdateRateLimitAuditDetails(decision: DurableRateLimitDecision): Record<string, unknown> {
	return durableRateLimitAuditDetails(decision);
}
