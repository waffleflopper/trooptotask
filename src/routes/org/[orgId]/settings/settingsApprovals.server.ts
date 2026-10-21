import { listDeletionRequests, type DeletionRequestReadContext } from '$features/deletion-requests/index.server';
import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';

export type ApprovalsSettingsData = {
	/** Newest first. */
	pendingRequests: DeletionRequestApproval[];
};

export async function loadApprovalsSettings(ctx: DeletionRequestReadContext): Promise<ApprovalsSettingsData> {
	const requests = await listDeletionRequests(ctx, { status: 'pending' });
	return {
		pendingRequests: requests.map((request) => ({
			id: request.id,
			status: request.status,
			requested_by_email: request.requested_by_email,
			resource_description: request.resource_description,
			resource_type: request.resource_type,
			resource_url: request.resource_url,
			created_at: request.created_at,
			denial_reason: request.denial_reason
		}))
	};
}
