import { checkDurableRateLimit, normalizeRateLimitEmail, type DurableRateLimitStore } from '$lib/access/index.server';

export const SIGN_IN_RATE_LIMIT_MESSAGE = 'Too many requests. Please wait and try again.';

export type SignInAdmission =
	| { status: 'admitted' }
	| { status: 'limited'; retryAfterSeconds: number }
	| { status: 'limit-unavailable' };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 10;
const MAX_PER_IP = 50;

// Every attempt counts before the provider sees it, so guessing one account's password is
// capped across every instance and address, and one address cannot spray many accounts.
export async function admitSignInAttempt(input: {
	email: string;
	ip: string;
	now?: Date;
	store?: DurableRateLimitStore;
}): Promise<SignInAdmission> {
	const { now, store } = input;
	const check = (name: 'email' | 'ip', value: string, maxRequests: number) =>
		checkDurableRateLimit({
			namespace: 'sign-in',
			dimensions: [{ name, value }],
			windowMs: WINDOW_MS,
			maxRequests,
			now,
			store
		});

	try {
		const decisions = await Promise.all([
			check('email', normalizeRateLimitEmail(input.email), MAX_PER_EMAIL),
			check('ip', input.ip, MAX_PER_IP)
		]);
		const waits = decisions.flatMap((decision) => (decision.limited ? [decision.retryAfterMs] : []));
		if (waits.length === 0) return { status: 'admitted' };
		return { status: 'limited', retryAfterSeconds: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
	} catch {
		return { status: 'limit-unavailable' };
	}
}
