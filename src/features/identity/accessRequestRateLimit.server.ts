import {
	checkDurableRateLimit,
	createSupabaseDurableRateLimitStore,
	normalizeRateLimitEmail,
	type DurableRateLimitDecision,
	type DurableRateLimitStore
} from '$lib/access/index.server';

const ACCESS_REQUEST_SUBMISSION_WINDOW_MS = 60 * 60 * 1000;
const ACCESS_REQUEST_SUBMISSION_MAX_REQUESTS = 5;

export const ACCESS_REQUEST_RATE_LIMIT_MESSAGE = 'Too many access request attempts. Please wait before trying again.';

export function checkAccessRequestSubmissionRateLimit(input: {
	email: string;
	ip?: string | null;
	now?: Date;
	store?: DurableRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	return checkDurableRateLimit({
		namespace: 'access-request-submission',
		dimensions: [
			{ name: 'email', value: normalizeRateLimitEmail(input.email) },
			{ name: 'ip', value: input.ip ?? null }
		],
		windowMs: ACCESS_REQUEST_SUBMISSION_WINDOW_MS,
		maxRequests: ACCESS_REQUEST_SUBMISSION_MAX_REQUESTS,
		now: input.now,
		store: input.store ?? createSupabaseDurableRateLimitStore()
	});
}
