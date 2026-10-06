import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireGovernancePolicy, requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import type { DeletionRequest, DeletionRequestResourceType, PendingDeletionRequestSummary } from './contracts';
import type { DeletionRequestStore } from './contracts.server';
import { AUDIT_RESOURCE } from './deletionRequestSupport.server';

export interface DeletionRequestReadContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	store: Pick<DeletionRequestStore, 'listRequests' | 'readPendingSummary'>;
}

export interface ListDeletionRequestsOptions {
	status?: string;
}

async function admittedRequester(ctx: DeletionRequestReadContext): Promise<string | undefined> {
	if (ctx.auth.role === 'owner' || ctx.auth.role === 'admin') {
		await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);
		return undefined;
	}
	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.listOwnDeletionRequests,
		ctx.auth.userId,
		AUDIT_RESOURCE
	);
	return ctx.auth.userId;
}

export async function listDeletionRequests(
	ctx: DeletionRequestReadContext,
	options?: ListDeletionRequestsOptions
): Promise<DeletionRequest[]> {
	const requestedBy = await admittedRequester(ctx);
	return ctx.store.listRequests(ctx.auth.orgId, { status: options?.status, requestedBy });
}

export async function readPendingDeletionRequestSummary(
	ctx: DeletionRequestReadContext
): Promise<PendingDeletionRequestSummary> {
	const requestedBy = await admittedRequester(ctx);
	return ctx.store.readPendingSummary(ctx.auth.orgId, requestedBy);
}

/** A fresh ordinary-client exact-binding read, not a token or a lock over later effects. */
export async function requirePendingDeletionRequest(
	store: Pick<DeletionRequestStore, 'findPendingById'>,
	orgId: string,
	requestId: string,
	resourceType: DeletionRequestResourceType,
	resourceId: string
): Promise<void> {
	if (!(await store.findPendingById(orgId, requestId, { resourceType, resourceId })))
		fail(404, 'Pending deletion request not found');
}

/** Delivery already admits Organization export; the supplied ordinary store retains RLS. */
export function listDeletionRequestExportRows(
	store: Pick<DeletionRequestStore, 'listExportRows'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.listExportRows(orgId);
}
