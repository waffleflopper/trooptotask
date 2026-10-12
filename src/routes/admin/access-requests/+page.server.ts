import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createPlatformAccessRequestOperations } from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';
import type {
	PlatformAccessRequestAdminRejectResult,
	PlatformAccessRequestAdminRescindResult,
	PlatformAccessRequestAdminSendResult
} from '$features/platform-admin/contracts';

function requestIdFromForm(formData: FormData): string | null {
	const requestId = formData.get('requestId');
	return typeof requestId === 'string' && requestId.trim() ? requestId : null;
}

function completedSetupFailure() {
	return fail(400, {
		error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
	});
}

function concurrentSetupCreateFailure() {
	return fail(409, {
		error:
			'Another setup link is being created for this request. Refresh and try again if a fresh link does not appear.'
	});
}

function mapSetupSendResult(action: 'approve' | 'resend', result: PlatformAccessRequestAdminSendResult) {
	switch (result.status) {
		case 'sent':
		case 'delivery_failed':
			return { success: true, action, setupDeliveryStatus: result.setupDeliveryStatus };
		case 'authorization_denied':
			return fail(403, {
				error: result.message,
				...result.failure
			});
		case 'rate_limited':
			return fail(429, {
				error: result.message,
				retryAfterSeconds: result.retryAfterSeconds
			});
		case 'already_reviewed':
		case 'not_found':
			return action === 'approve'
				? fail(404, { error: 'Request not found or already reviewed' })
				: fail(404, { error: 'Approved request not found' });
		case 'not_approved':
			return action === 'approve'
				? fail(400, { error: 'Access request must be approved before setup can be sent.' })
				: fail(404, { error: 'Approved request not found' });
		case 'setup_completed':
			return completedSetupFailure();
		case 'concurrent_create':
			return concurrentSetupCreateFailure();
		case 'failed':
			return fail(500, {
				error: action === 'approve' ? 'Failed to approve request' : 'Failed to resend setup email'
			});
	}
}

function mapRejectResult(result: PlatformAccessRequestAdminRejectResult) {
	switch (result.status) {
		case 'rejected':
			return { success: true, action: 'reject' };
		case 'authorization_denied':
			return fail(403, {
				error: result.message,
				...result.failure
			});
		case 'already_reviewed':
		case 'not_found':
			return fail(404, { error: 'Request not found or already reviewed' });
		case 'failed':
			return fail(500, { error: 'Failed to reject request' });
	}
}

function mapRescindResult(result: PlatformAccessRequestAdminRescindResult) {
	switch (result.status) {
		case 'rescinded':
			return { success: true, action: 'rescind' };
		case 'authorization_denied':
			return fail(403, {
				error: result.message,
				...result.failure
			});
		case 'not_approved':
			return fail(404, { error: 'Approved request not found' });
		case 'setup_completed':
			return fail(409, {
				error: 'This user has already completed account setup, so platform access can no longer be rescinded here.'
			});
		case 'claim_held':
			return fail(409, {
				error:
					'A setup attempt holds a claim on this request. Confirm its Auth operation has ended and release the claim before rescinding.'
			});
		case 'failed':
			return fail(500, { error: 'Failed to rescind request' });
	}
}

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformAccessRequestOperations(event);
	return operations.list();
};

export const actions: Actions = {
	approve: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const formData = await event.request.formData();
		const requestId = requestIdFromForm(formData);
		if (!requestId) return fail(400, { error: 'Missing request ID' });
		if (!validateUUID(requestId)) return fail(400, { error: 'Invalid request ID' });

		return mapSetupSendResult('approve', await operations.approve(requestId));
	},

	reject: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const formData = await event.request.formData();
		const requestId = requestIdFromForm(formData);
		if (!requestId) return fail(400, { error: 'Missing request ID' });
		if (!validateUUID(requestId)) return fail(400, { error: 'Invalid request ID' });

		return mapRejectResult(await operations.reject(requestId));
	},

	rescind: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const formData = await event.request.formData();
		const requestId = requestIdFromForm(formData);
		if (!requestId) return fail(400, { error: 'Missing request ID' });
		if (!validateUUID(requestId)) return fail(400, { error: 'Invalid request ID' });

		return mapRescindResult(await operations.rescind(requestId));
	},

	resend: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const formData = await event.request.formData();
		const requestId = requestIdFromForm(formData);
		if (!requestId) return fail(400, { error: 'Missing request ID' });
		if (!validateUUID(requestId)) return fail(400, { error: 'Invalid request ID' });

		return mapSetupSendResult('resend', await operations.resendSetup(requestId));
	}
};
