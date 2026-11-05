import { checkDurableRateLimit, type DurableRateLimitStore } from '$lib/access/index.server';

const WINDOW_MS = 60 * 60 * 1000;
export const MAX_CLIENT_REPORTS_PER_HOUR = 30;

/** One budget per signed-in account, shared by the account and Organization report endpoints. */
export async function isClientReportLimited(input: {
	userId: string;
	now?: Date;
	store?: DurableRateLimitStore;
}): Promise<boolean> {
	const decision = await checkDurableRateLimit({
		namespace: 'client-error-report',
		dimensions: [{ name: 'user', value: input.userId }],
		windowMs: WINDOW_MS,
		maxRequests: MAX_CLIENT_REPORTS_PER_HOUR,
		now: input.now,
		store: input.store
	});
	return decision.limited;
}
