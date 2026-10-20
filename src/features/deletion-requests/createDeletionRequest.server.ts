import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { subjectDetails } from '$lib/audit/index.server';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import type { DeletionRequest, DeletionRequestResourceType } from './contracts';
import type { DeletionRequestSubmissionPort } from './contracts.server';
import { AUDIT_RESOURCE, fireAndForgetNotification, isSupportedResourceType } from './deletionRequestSupport.server';

export interface DeletionRequestCreationContext {
	auth: Pick<OrganizationAccessGrant, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'> & { orgId: string };
	audit: PolicyAuditSink;
	store: DeletionRequestSubmissionPort;
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
}

export interface CreateDeletionRequestInput {
	resourceType: DeletionRequestResourceType;
	resourceId: string;
	resourceDescription: string;
	resourceUrl?: string | null;
	userEmail: string;
}

export async function createDeletionRequest(
	ctx: DeletionRequestCreationContext,
	input: CreateDeletionRequestInput
): Promise<DeletionRequest> {
	if (!isSupportedResourceType(input.resourceType)) {
		fail(400, `Unsupported resource type: ${input.resourceType}`);
	}

	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.createOwnDeletionRequest,
		ctx.auth.userId,
		AUDIT_RESOURCE,
		undefined
	);

	const submission = await ctx.store.submitPending(ctx.auth.orgId, {
		requestedBy: ctx.auth.userId,
		requesterEmail: input.userEmail,
		resourceType: input.resourceType,
		resourceId: input.resourceId,
		description: input.resourceDescription,
		resourceUrl: input.resourceUrl ?? null
	});
	if (submission.outcome === 'duplicate') {
		fail(409, 'A pending deletion request already exists for this resource');
	}
	const row = submission.request;

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id,
		details: subjectDetails({
			subjectType: input.resourceType,
			subjectId: input.resourceId,
			subjectLabel: input.resourceDescription
		})
	});

	// Notify admins/owners about the pending request
	const isPersonnel = input.resourceType === 'personnel';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	fireAndForgetNotification(() =>
		ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'deletion_request_pending',
			title: `${isPersonnel ? 'Archival' : 'Deletion'} Request`,
			message: `${input.userEmail} requested to ${actionWord} "${input.resourceDescription}". Review in Unit settings.`,
			link: `/org/${ctx.auth.orgId}/settings`
		})
	);

	return row;
}
