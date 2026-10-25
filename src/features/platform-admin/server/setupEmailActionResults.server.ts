import { fail } from '@sveltejs/kit';
import type { PlatformAccessRequestAdminSendResult, PlatformAccessRequestAdminRescindResult } from '../contracts';

export function mapResendSetupResult(result: PlatformAccessRequestAdminSendResult) {
	switch (result.status) {
		case 'sent':
			return { success: true, action: 'resendSetup' };
		case 'email_sent_recording_failed':
			return fail(500, {
				status: result.status,
				emailSent: true,
				error: 'The setup email was sent, but its delivery record could not be saved. Reload before sending again.'
			});
		case 'email_sent_audit_failed':
			return fail(500, {
				status: result.status,
				emailSent: true,
				error: 'The setup email was sent, but the required audit could not be recorded. Reload before sending again.'
			});
		case 'delivery_failed':
			return fail(502, {
				status: result.status,
				error: 'The new setup link was created, but the email could not be delivered.'
			});
		case 'authorization_denied':
			return fail(403, { error: result.message, ...result.failure });
		case 'rate_limited':
			return fail(429, { error: result.message, retryAfterSeconds: result.retryAfterSeconds });
		case 'concurrent_create':
			return fail(409, { error: 'Another setup link is being created. Reload before trying again.' });
		case 'failed':
			return fail(500, { error: 'Could not confirm the resend. Reload before trying again.' });
		default:
			return fail(409, { status: result.status, error: 'This request is no longer eligible for a setup link.' });
	}
}
export function mapRescindSetupResult(result: PlatformAccessRequestAdminRescindResult) {
	if (result.status === 'rescinded') return { success: true, action: 'rescindAccess' };
	if (result.status === 'authorization_denied') return fail(403, { error: result.message, ...result.failure });
	return fail(result.status === 'failed' ? 500 : 409, {
		status: result.status,
		error:
			result.status === 'claim_held'
				? 'Account setup is in progress. Access cannot be rescinded while its claim is held.'
				: 'Could not confirm the rescission. Reload before trying again.'
	});
}
