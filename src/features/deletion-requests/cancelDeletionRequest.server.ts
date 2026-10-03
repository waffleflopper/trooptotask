import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { TABLE, AUDIT_RESOURCE } from './deletionRequestSupport.server';

export interface DeletionRequestCancellationPort {
	cancelPendingRequest(organizationId: string, requestId: string): Promise<void>;
}

interface CancellationContext {
	auth: Parameters<typeof requireIdentityOwnedPolicy>[0]['auth'] & { orgId: string };
	audit: NonNullable<Parameters<typeof requireIdentityOwnedPolicy>[0]['audit']>;
	store: {
		findOne<T>(table: 'deletion_requests', orgId: string, filters: Record<string, unknown>): Promise<T | null>;
	};
	cancellation: DeletionRequestCancellationPort;
}

/** Keep request history; cancellation never applies the requested source effect. */
export async function cancelDeletionRequest(ctx: CancellationContext, requestId: string): Promise<void> {
	const request = await ctx.store.findOne<{ requested_by: string | null }>(TABLE, ctx.auth.orgId, {
		id: requestId,
		status: 'pending'
	});
	if (!request) fail(404, 'Pending deletion request not found');

	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
		request.requested_by,
		AUDIT_RESOURCE,
		requestId
	);

	await ctx.cancellation.cancelPendingRequest(ctx.auth.orgId, requestId);
	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.cancelled`,
		resourceType: AUDIT_RESOURCE,
		resourceId: requestId
	});
}
