import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminAction, loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAccessRequestAdministration } from '$lib/server/adapters/supabasePlatformAccessRequestAdministration';
import type {
	PlatformAccessRequestAdminRejectResult,
	PlatformAccessRequestAdminSendResult
} from '$lib/server/core/useCases/platformAccessRequestAdministration';

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

export const load: PageServerLoad = loadWithAdminContext({
	page: 'access-requests',
	fn: async (ctx) => createSupabasePlatformAccessRequestAdministration(ctx).list()
});

export const actions: Actions = {
	approve: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const requestId = requestIdFromForm(formData);
			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const result = await createSupabasePlatformAccessRequestAdministration(ctx).approve({
				accessRequestId: requestId,
				actorUserId: ctx.adminUser.id,
				publicOrigin: event.url.origin
			});

			return mapSetupSendResult('approve', result);
		}
	}),

	reject: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const requestId = requestIdFromForm(formData);
			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const result = await createSupabasePlatformAccessRequestAdministration(ctx).reject({
				accessRequestId: requestId,
				actorUserId: ctx.adminUser.id
			});

			return mapRejectResult(result);
		}
	}),

	resend: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const requestId = requestIdFromForm(formData);
			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const result = await createSupabasePlatformAccessRequestAdministration(ctx).resendSetup({
				accessRequestId: requestId,
				actorUserId: ctx.adminUser.id,
				publicOrigin: event.url.origin
			});

			return mapSetupSendResult('resend', result);
		}
	})
};
