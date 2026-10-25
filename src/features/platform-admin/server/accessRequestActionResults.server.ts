import { fail } from '@sveltejs/kit';
import type { PlatformAccessRequestAdminRejectResult, PlatformAccessRequestAdminSendResult } from '../contracts';

/** Page-action results for access request commands. A `failed` outcome can follow a confirmed write. */
const RELOAD_ADVICE = 'Reload this item to see where it stands before trying again.';

export function mapApproveResult(result: PlatformAccessRequestAdminSendResult) {
	switch (result.status) {
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
		case 'sent':
		case 'delivery_failed':
			return { success: true, action: 'approve', setupDeliveryStatus: result.setupDeliveryStatus };
		case 'authorization_denied':
			return fail(403, { error: result.message, ...result.failure });
		case 'rate_limited':
			return fail(429, { error: result.message, retryAfterSeconds: result.retryAfterSeconds });
		case 'already_reviewed':
		case 'not_found':
			return fail(404, { error: 'This request was already reviewed or no longer exists.' });
		case 'not_approved':
			return fail(400, { error: 'Access request must be approved before setup can be sent.' });
		case 'setup_completed':
			return fail(400, {
				error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
			});
		case 'concurrent_create':
			return fail(409, {
				error:
					'Another setup link is being created for this request. Refresh and try again if a fresh link does not appear.'
			});
		case 'failed':
			return fail(500, { error: `Could not confirm the approval. ${RELOAD_ADVICE}` });
	}
}

export function mapRejectResult(result: PlatformAccessRequestAdminRejectResult) {
	switch (result.status) {
		case 'rejected':
			return { success: true, action: 'reject' };
		case 'authorization_denied':
			return fail(403, { error: result.message, ...result.failure });
		case 'already_reviewed':
		case 'not_found':
			return fail(404, { error: 'This request was already reviewed or no longer exists.' });
		case 'failed':
			return fail(500, { error: `Could not confirm the rejection. ${RELOAD_ADVICE}` });
	}
}
