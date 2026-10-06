import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { AUDIT_RESOURCE } from './deletionRequestSupport.server';
import type { DeletionRequestStore } from './contracts.server';

export interface DeletionRequestCancellationPort {
	cancelPendingRequest(organizationId: string, requestId: string): Promise<void>;
}

export interface DeletionRequestCancellationContext {
	auth: Pick<OrganizationAccessGrant, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'> & { orgId: string };
	audit: PolicyAuditSink;
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
