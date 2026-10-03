import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { AUDIT_RESOURCE } from './deletionRequestSupport.server';
import type { DeletionRequestStore } from './contracts.server';

export interface DeletionRequestCancellationPort {
	cancelPendingRequest(organizationId: string, requestId: string): Promise<void>;
}

export interface DeletionRequestCancellationContext {
	auth: Parameters<typeof requireIdentityOwnedPolicy>[0]['auth'] & { orgId: string };
	audit: NonNullable<Parameters<typeof requireIdentityOwnedPolicy>[0]['audit']>;
	store: Pick<DeletionRequestStore, 'findPendingById'>;
	cancellation: DeletionRequestCancellationPort;
}

/** Keep request history; cancellation never applies the requested source effect. */
export async function cancelDeletionRequest(ctx: DeletionRequestCancellationContext, requestId: string): Promise<void> {
	const request = await ctx.store.findPendingById(ctx.auth.orgId, requestId);
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
