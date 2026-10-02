import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { subjectDetails } from '$lib/audit/index.server';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import {
	TABLE,
	AUDIT_RESOURCE,
	fireAndForgetNotification,
	isSupportedResourceType
} from './deletionRequestSupport.server';

interface DeletionRequestCreationContext {
	auth: Parameters<typeof requireIdentityOwnedPolicy>[0]['auth'] & { orgId: string };
	audit: NonNullable<Parameters<typeof requireIdentityOwnedPolicy>[0]['audit']>;
	store: {
		findOne<T>(table: 'deletion_requests', orgId: string, filters: Record<string, unknown>): Promise<T | null>;
		insert<T>(table: 'deletion_requests', orgId: string, data: Record<string, unknown>): Promise<T>;
	};
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
}

export interface CreateDeletionRequestInput {
	resourceType: string;
	resourceId: string;
	resourceDescription: string;
	resourceUrl?: string | null;
	userEmail: string;
}

export async function createDeletionRequest(
	ctx: DeletionRequestCreationContext,
	input: CreateDeletionRequestInput
): Promise<Record<string, unknown>> {
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

	// Check for existing pending request for the same resource
	const existing = await ctx.store.findOne<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		resource_type: input.resourceType,
		resource_id: input.resourceId,
		status: 'pending'
	});

	if (existing) {
		fail(409, 'A pending deletion request already exists for this resource');
	}

	const row = await ctx.store.insert<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		requested_by: ctx.auth.userId,
		requested_by_email: input.userEmail,
		resource_type: input.resourceType,
		resource_id: input.resourceId,
		resource_description: input.resourceDescription,
		resource_url: input.resourceUrl ?? null,
		status: 'pending'
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined,
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
			message: `${input.userEmail} requested to ${actionWord} "${input.resourceDescription}". Review in Organization Settings.`,
			link: `/org/${ctx.auth.orgId}/settings`
		})
	);

	return row;
}
