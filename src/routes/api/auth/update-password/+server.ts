import { getPendingAuthFlowCookieName, updateIdentityPassword } from '$features/identity/index.server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auditLog } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const result = await updateIdentityPassword(
		locals,
		async () => {
			const body: unknown = await request.json().catch(() => null);
			return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
		},
		getClientAddress
	);
	switch (result.status) {
		case 'inactive':
			return json(
				{ error: 'Your account recovery session is no longer active. Please reopen the link and try again.' },
				{ status: 401 }
			);
		case 'invalid-input':
			return json({ error: 'Invalid password update request' }, { status: 400 });
		case 'invalid-action':
			return json({ error: 'Invalid completion action.' }, { status: 400 });
		case 'password-required':
			return json({ error: 'New password is required' }, { status: 400 });
		case 'invalid-password':
			return json({ error: result.error }, { status: 400 });
		case 'current-password-required':
			return json({ error: 'Current password is required' }, { status: 400 });
		case 'password-mismatch':
			return json({ error: 'New passwords do not match' }, { status: 400 });
		case 'email-unavailable':
			return json({ error: 'Current user email is unavailable' }, { status: 401 });
		case 'incorrect-password':
			return json({ error: 'Current password is incorrect' }, { status: 401 });
		case 'proof-unavailable':
			return json({ error: 'Unable to verify your current password. Please try again.' }, { status: 503 });
		case 'assurance-unavailable':
			return json({ error: 'Unable to verify authentication status. Please try again.' }, { status: 503 });
		case 'expired':
			return json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
		case 'mfa-required':
			return json(
				{ code: 'mfa_required', error: 'Verify your authenticator code before changing your password.' },
				{ status: 403 }
			);
		case 'reconciliation':
			return json(
				{
					ok: false,
					code: 'password_reconciliation_required',
					state: result.state ?? 'failed',
					error:
						result.error ??
						(result.state === 'failed'
							? 'This attempt did not commit. Start a new password update to try again.'
							: 'Check the saved password update before continuing.')
				},
				{ status: result.state === 'unavailable' ? 503 : 409 }
			);
		case 'revocation-pending':
			auditLog(
				{
					action: 'auth.session_revoke_failed',
					resourceType: 'user',
					resourceId: result.userId,
					severity: 'warning',
					details: {}
				},
				{ userId: result.userId }
			);
			return json(
				{
					ok: false,
					passwordUpdated: true,
					code: 'session_revocation_pending',
					error: 'Your password changed. Finish signing out other sessions to complete this update.'
				},
				{ status: 202 }
			);
		case 'limited':
			auditLog(
				{
					action: 'auth.password_update_rate_limited',
					resourceType: 'user',
					resourceId: result.userId,
					severity: 'warning',
					details: result.auditDetails
				},
				{
					userId: result.userId,
					userEmail: result.userEmail,
					ip: result.ip,
					userAgent: request.headers.get('user-agent') ?? ''
				}
			);
			return json(
				{
					error: 'Too many password update attempts. Please wait before trying again.',
					retryAfterSeconds: result.retryAfterSeconds
				},
				{ status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
			);
		case 'complete':
			if (result.clearRecoveryFlow) cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
			return json({ ok: true });
	}
};
