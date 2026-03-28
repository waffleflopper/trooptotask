import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

const TABLE = 'deletion_requests';
const AUDIT_RESOURCE = 'deletion_request';

export interface CreateDeletionRequestInput {
	resourceType: string;
	resourceId: string;
	resourceDescription: string;
	resourceUrl?: string | null;
	userEmail: string;
}

export async function createDeletionRequest(
	ctx: WritePorts,
	input: CreateDeletionRequestInput
): Promise<Record<string, unknown>> {
	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

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
		details: {
			resource_type: input.resourceType,
			resource_id: input.resourceId,
			resource_description: input.resourceDescription
		}
	});

	// Notify admins/owners about the pending request
	const isPersonnel = input.resourceType === 'personnel';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
		type: 'deletion_request_pending',
		title: `${isPersonnel ? 'Archival' : 'Deletion'} Request`,
		message: `${input.userEmail} requested to ${actionWord} "${input.resourceDescription}". Review in Admin Hub.`,
		link: `/org/${ctx.auth.orgId}/admin/approvals`
	});

	return row;
}

const RESOURCE_TYPE_TABLE_MAP: Record<string, string> = {
	personnel: 'personnel',
	counseling_record: 'counseling_records',
	personnel_training: 'personnel_trainings',
	development_goal: 'development_goals',
	training_type: 'training_types',
	counseling_type: 'counseling_types',
	rating_scheme_entry: 'rating_scheme_entries'
};

async function fetchPendingRequest(ctx: WritePorts, requestId: string): Promise<Record<string, unknown>> {
	const request = await ctx.store.findOne<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		id: requestId,
		status: 'pending'
	});

	if (!request) {
		fail(404, 'Pending deletion request not found');
	}

	return request;
}

function notifyRequester(
	ctx: WritePorts,
	request: Record<string, unknown>,
	notification: { type: string; title: string; message: string; link?: string | null }
): Promise<Record<string, unknown>> {
	return ctx.store.insert('notifications', ctx.auth.orgId, {
		user_id: request.requested_by,
		type: notification.type,
		title: notification.title,
		message: notification.message,
		link: notification.link ?? null
	});
}

export async function approveDeletionRequest(ctx: WritePorts, requestId: string): Promise<void> {
	ctx.auth.requirePrivileged();

	const request = await fetchPendingRequest(ctx, requestId);

	// Update request status
	await ctx.store.update(TABLE, ctx.auth.orgId, requestId, {
		status: 'approved',
		reviewed_by: ctx.auth.userId,
		reviewed_at: new Date().toISOString(),
		denial_reason: null
	});

	// Execute the deletion effect
	const resourceType = request.resource_type as string;
	const resourceId = request.resource_id as string;
	const tableName = RESOURCE_TYPE_TABLE_MAP[resourceType];

	if (!tableName) {
		fail(400, `Unsupported resource type: ${resourceType}`);
	}

	if (resourceType === 'personnel') {
		await ctx.store.update(tableName, ctx.auth.orgId, resourceId, {
			archived_at: new Date().toISOString()
		});
	} else {
		await ctx.store.delete(tableName, ctx.auth.orgId, resourceId);
	}

	// Notify the requester
	const isPersonnel = resourceType === 'personnel';
	const actionWordCap = isPersonnel ? 'Archival' : 'Deletion';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	await notifyRequester(ctx, request, {
		type: 'deletion_approved',
		title: `${actionWordCap} Approved`,
		message: `Your request to ${actionWord} "${request.resource_description}" has been approved.`
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.approved`,
		resourceType: AUDIT_RESOURCE,
		resourceId: requestId,
		details: {
			reviewer: ctx.auth.userId,
			resource_type: resourceType,
			resource_id: resourceId,
			resource_description: request.resource_description
		}
	});
}

export async function denyDeletionRequest(ctx: WritePorts, requestId: string, reason?: string): Promise<void> {
	ctx.auth.requirePrivileged();

	const request = await fetchPendingRequest(ctx, requestId);

	await ctx.store.update(TABLE, ctx.auth.orgId, requestId, {
		status: 'denied',
		reviewed_by: ctx.auth.userId,
		reviewed_at: new Date().toISOString(),
		denial_reason: reason ?? null
	});

	const resourceType = request.resource_type as string;
	const isPersonnel = resourceType === 'personnel';
	const actionWordCap = isPersonnel ? 'Archival' : 'Deletion';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	await notifyRequester(ctx, request, {
		type: 'deletion_denied',
		title: `${actionWordCap} Denied`,
		message: `Your request to ${actionWord} "${request.resource_description}" has been denied.${reason ? ` Reason: ${reason}` : ''}`,
		link: request.resource_url as string | null
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.denied`,
		resourceType: AUDIT_RESOURCE,
		resourceId: requestId,
		details: {
			reviewer: ctx.auth.userId,
			resource_type: resourceType,
			resource_id: request.resource_id,
			resource_description: request.resource_description,
			denial_reason: reason ?? null
		}
	});
}

export async function cancelDeletionRequest(ctx: WritePorts, requestId: string): Promise<void> {
	const request = await fetchPendingRequest(ctx, requestId);

	if (request.requested_by !== ctx.auth.userId) {
		fail(403, 'You can only cancel your own deletion requests');
	}

	await ctx.store.update(TABLE, ctx.auth.orgId, requestId, {
		status: 'cancelled'
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.cancelled`,
		resourceType: AUDIT_RESOURCE,
		resourceId: requestId
	});
}

export interface ListDeletionRequestsOptions {
	status?: string;
}

export async function listDeletionRequests(
	ctx: WritePorts,
	options?: ListDeletionRequestsOptions
): Promise<Record<string, unknown>[]> {
	const filters: Record<string, unknown> = {};

	if (options?.status) {
		filters.status = options.status;
	}

	// Non-privileged users only see their own requests
	if (!ctx.auth.isPrivileged && ctx.auth.userId) {
		filters.requested_by = ctx.auth.userId;
	}

	return ctx.store.findMany<Record<string, unknown>>(TABLE, ctx.auth.orgId, filters, {
		orderBy: [{ column: 'created_at', ascending: false }]
	});
}
