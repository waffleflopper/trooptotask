import type { IdentityAuditWriter } from './auditWriter.server';
import { getAuthConfirmRedirectTo } from './authConfirm.server';
import { sendPublicRecoveryEmail } from './authEmailDelivery.server';
import { sanitizeString, validateEmail } from '$lib/server/validation';
import { checkForgotPasswordRateLimit, forgotPasswordRateLimitAuditDetails } from './forgotPasswordRateLimit.server';

export type PublicPasswordRecoveryRequestResult =
	| { status: 'invalid-email'; email: string }
	| { status: 'rate-limited'; email: string }
	| { status: 'accepted'; email: string };

type Dependencies = {
	checkRateLimit?: typeof checkForgotPasswordRateLimit;
	sendEmail?: typeof sendPublicRecoveryEmail;
	audit: IdentityAuditWriter;
};

export async function requestPublicPasswordRecovery(
	input: { email: unknown; clientAddress: () => string; origin: string; userAgent: string },
	deps: Dependencies
): Promise<PublicPasswordRecoveryRequestResult> {
	const email = sanitizeString(typeof input.email === 'string' ? input.email : null, 254);
	if (!email || !validateEmail(email)) return { status: 'invalid-email', email };

	const ip = input.clientAddress();
	const decision = await (deps.checkRateLimit ?? checkForgotPasswordRateLimit)({ email, ip });
	if (decision.limited) {
		await deps.audit(
			{
				action: 'auth.forgot_password_rate_limited',
				resourceType: 'user',
				severity: 'warning',
				details: forgotPasswordRateLimitAuditDetails(decision)
			},
			{ userId: null, userEmail: email, ip, userAgent: input.userAgent }
		);
		return { status: 'rate-limited', email };
	}

	const redirectTo = getAuthConfirmRedirectTo(input.origin, 'recovery');
	try {
		await (deps.sendEmail ?? sendPublicRecoveryEmail)(email, redirectTo);
	} catch {
		// Public recovery never reveals whether this address has an account or delivery succeeded.
	}
	return { status: 'accepted', email };
}
