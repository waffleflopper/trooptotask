import { createHash } from 'node:crypto';

interface RateLimitBucket {
	count: number;
	resetAt: number;
}

export const ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE =
	'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.';
export const ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE =
	'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.';

const RENEWAL_WINDOW_MS = 60 * 60 * 1000;
const RENEWAL_MAX_REQUESTS = 3;
const SETUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const SETUP_ATTEMPT_MAX_REQUESTS = 5;

const buckets = new Map<string, RateLimitBucket>();

function sweepExpiredBuckets(nowMs: number): void {
	for (const [key, bucket] of buckets.entries()) {
		if (nowMs > bucket.resetAt) {
			buckets.delete(key);
		}
	}
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function hashDimension(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function checkBucket(
	key: string,
	windowMs: number,
	maxRequests: number,
	nowMs: number
): { limited: false } | { limited: true; retryAfterMs: number } {
	const existing = buckets.get(key);
	if (!existing || nowMs > existing.resetAt) {
		buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
		return { limited: false };
	}

	existing.count += 1;
	if (existing.count > maxRequests) {
		return { limited: true, retryAfterMs: existing.resetAt - nowMs };
	}

	return { limited: false };
}

function checkDimensions(
	keys: string[],
	windowMs: number,
	maxRequests: number,
	nowMs: number
): { limited: false } | { limited: true; retryAfterMs: number } {
	sweepExpiredBuckets(nowMs);

	let retryAfterMs = 0;
	for (const key of keys) {
		const result = checkBucket(key, windowMs, maxRequests, nowMs);
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
}): { limited: false } | { limited: true; retryAfterMs: number } {
	const keys = [`account-setup-renewal:email:${hashDimension(normalizeEmail(input.email))}`];
	if (input.ip) {
		keys.push(`account-setup-renewal:ip:${hashDimension(input.ip)}`);
	}

	return checkDimensions(keys, RENEWAL_WINDOW_MS, RENEWAL_MAX_REQUESTS, input.now?.getTime() ?? Date.now());
}

export function checkAccountSetupCompletionRateLimit(input: {
	setupLinkId: string;
	accessRequestId: string;
	email?: string | null;
	ip?: string | null;
	now?: Date;
}): { limited: false } | { limited: true; retryAfterMs: number } {
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

	return checkDimensions(keys, SETUP_ATTEMPT_WINDOW_MS, SETUP_ATTEMPT_MAX_REQUESTS, input.now?.getTime() ?? Date.now());
}

export function resetAccountSetupRateLimits(): void {
	buckets.clear();
}
