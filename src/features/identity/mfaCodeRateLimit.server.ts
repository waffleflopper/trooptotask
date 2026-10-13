import { checkDurableRateLimit, type DurableRateLimitStore } from '$lib/access/index.server';

export const MFA_CODE_RATE_LIMIT_MESSAGE = 'Too many authenticator codes. Please wait before trying again.';

export type MfaCodeAdmission =
	| { status: 'admitted' }
	| { status: 'limited'; retryAfterSeconds: number }
	| { status: 'limit-unavailable' };

// Codes for a verified factor are limited per account across every address, so
// a stolen password cannot search the six-digit space. Shared unit networks are
// not limited together because the key is the account alone.
export async function admitMfaCodeAttempt(
	userId: string,
	options: { now?: Date; store?: DurableRateLimitStore } = {}
): Promise<MfaCodeAdmission> {
	try {
		const limit = await checkDurableRateLimit({
			namespace: 'mfa-code',
			dimensions: [{ name: 'user', value: userId }],
			windowMs: 15 * 60 * 1000,
			maxRequests: 10,
			...options
		});
		if (!limit.limited) return { status: 'admitted' };
		return { status: 'limited', retryAfterSeconds: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)) };
	} catch {
		return { status: 'limit-unavailable' };
	}
}
