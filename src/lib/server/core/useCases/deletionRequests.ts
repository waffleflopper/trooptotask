/**
 * Deletion request use cases — two-step soft-delete workflow for personnel records.
 *
 * When archiving a personnel record that has related data (training records, counseling,
 * etc.), the use case creates a `deletion_request` row and notifies admins instead of
 * deleting immediately. An admin must then approve or reject the request.
 *
 * `approveDeletionRequest` soft-archives personnel rows (sets `archived_at`) or hard-deletes
 * other resource types. `denyDeletionRequest` cancels the request and notifies the requester.
 *
 * Notification sends are fire-and-forget — failures don't block the mutation.
 */
import { fail } from '$lib/errors';
import type { WritePorts, WriteWithNotificationsPorts } from '$lib/server/core/ports';
import { subjectDetails, reviewerDetails } from '$lib/audit/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireGovernancePolicy } from './governancePolicy';
import { requireIdentityOwnedPolicy } from './identityPolicy';
import {
	TABLE,
	AUDIT_RESOURCE,
	fireAndForgetNotification,
	isSupportedResourceType
} from '$features/deletion-requests/deletionRequestSupport.server';
import { archiveApprovedPersonnelRecord } from '$features/personnel/index.server';
import type { ApprovedRatingSchemeDeletionPort } from '$features/rating-scheme/index.server';
import type { ApprovedTrainingDeletionPort } from '$features/training/index.server';

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
	ctx: WriteWithNotificationsPorts,
	request: Record<string, unknown>,
	notification: { type: string; title: string; message: string; link?: string | null }
): void {
	const requesterId = request.requested_by;
	if (typeof requesterId !== 'string' || requesterId.length === 0) {
		return;
	}

	fireAndForgetNotification(() => ctx.notifications.notifyUser(ctx.auth.orgId, requesterId, notification));
}

export async function approveDeletionRequest(
	ctx: WriteWithNotificationsPorts,
	requestId: string,
	trainingDeletion?: ApprovedTrainingDeletionPort,
	ratingSchemeDeletion?: ApprovedRatingSchemeDeletionPort
): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);

	const request = await fetchPendingRequest(ctx, requestId);

	const resourceType = request.resource_type as string;
	const resourceId = request.resource_id as string;

	if (!isSupportedResourceType(resourceType)) {
		fail(400, `Unsupported resource type: ${resourceType}`);
	}

	if (resourceType === 'counseling_record') {
		if (!ctx.personnelGovernanceDeletion) throw new Error('Personnel governance deletion port is required');
		await ctx.personnelGovernanceDeletion.deleteApprovedCounselingRecord(
			ctx.auth,
			requestId,
			resourceId,
			new Date().toISOString()
		);
	} else {
		if (resourceType === 'personnel') {
			await archiveApprovedPersonnelRecord(ctx, resourceId);
		} else if (resourceType === 'training_type') {
			if (!trainingDeletion) throw new Error('Training approved deletion port is required');
			await trainingDeletion.deleteApprovedTrainingType(ctx.auth, requestId, resourceId);
		} else if (resourceType === 'personnel_training') {
			if (!trainingDeletion) throw new Error('Training approved deletion port is required');
			await trainingDeletion.deleteApprovedTrainingRecord(ctx.auth, requestId, resourceId);
		} else if (resourceType === 'rating_scheme_entry') {
			if (!ratingSchemeDeletion) throw new Error('Rating Scheme approved deletion port is required');
			await ratingSchemeDeletion.deleteApprovedRatingSchemeEntry(ctx.auth, requestId, resourceId);
		}

		await ctx.store.update(TABLE, ctx.auth.orgId, requestId, {
			status: 'approved',
			reviewed_by: ctx.auth.userId,
			reviewed_at: new Date().toISOString(),
			denial_reason: null
		});
	}

	// Notify the requester
	const isPersonnel = resourceType === 'personnel';
	const actionWordCap = isPersonnel ? 'Archival' : 'Deletion';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	notifyRequester(ctx, request, {
		type: 'deletion_approved',
		title: `${actionWordCap} Approved`,
		message: `Your request to ${actionWord} "${request.resource_description}" has been approved.`
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.approved`,
		resourceType: AUDIT_RESOURCE,
		resourceId: requestId,
		details: {
			...reviewerDetails(ctx.auth.userId),
			...subjectDetails({
				subjectType: resourceType,
				subjectId: resourceId,
				subjectLabel: request.resource_description as string | null
			})
		}
	});
}

export async function denyDeletionRequest(
	ctx: WriteWithNotificationsPorts,
	requestId: string,
	reason?: string
): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);

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

	notifyRequester(ctx, request, {
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
			...reviewerDetails(ctx.auth.userId),
			...subjectDetails({
				subjectType: resourceType,
				subjectId: request.resource_id as string,
				subjectLabel: request.resource_description as string | null
			}),
			denial_reason: reason ?? null
		}
	});
}

export async function cancelDeletionRequest(ctx: WritePorts, requestId: string): Promise<void> {
	const request = await fetchPendingRequest(ctx, requestId);

	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
		typeof request.requested_by === 'string' ? request.requested_by : null,
		AUDIT_RESOURCE,
		requestId
	);

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

	if (ctx.auth.role === 'owner' || ctx.auth.role === 'admin') {
		await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);
	} else {
		await requireIdentityOwnedPolicy(
			ctx,
			POLICY_ACTION_CATALOG.identity.listOwnDeletionRequests,
			ctx.auth.userId,
			AUDIT_RESOURCE
		);
		filters.requested_by = ctx.auth.userId;
	}

	return ctx.store.findMany<Record<string, unknown>>(TABLE, ctx.auth.orgId, filters, {
		orderBy: [{ column: 'created_at', ascending: false }]
	});
}
