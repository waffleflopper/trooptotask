import { fail } from '$lib/errors';
import type { DeletionRequest } from './contracts';
import type { ApprovedDeletionEffects, DeletionRequestStore } from './contracts.server';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import { subjectDetails, reviewerDetails } from '$lib/audit/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { AUDIT_RESOURCE, fireAndForgetNotification, isSupportedResourceType } from './deletionRequestSupport.server';
type GovernancePorts = Parameters<typeof requireGovernancePolicy>[0];
export interface DeletionRequestReviewContext {
	auth: GovernancePorts['auth'];
	audit: GovernancePorts['audit'];
	store: Pick<DeletionRequestStore, 'findPendingById' | 'completePendingReview'>;
	notifications: Pick<NotificationDeliveryPort, 'notifyUser'>;
}

async function fetchPendingRequest(ctx: DeletionRequestReviewContext, requestId: string): Promise<DeletionRequest> {
	const request = await ctx.store.findPendingById(ctx.auth.orgId, requestId);

	if (!request) {
		fail(404, 'Pending deletion request not found');
	}

	return request;
}

function notifyRequester(
	ctx: DeletionRequestReviewContext,
	request: DeletionRequest,
	notification: { type: string; title: string; message: string; link?: string | null }
): void {
	const requesterId = request.requested_by;
	if (typeof requesterId !== 'string' || requesterId.length === 0) {
		return;
	}

	fireAndForgetNotification(() => ctx.notifications.notifyUser(ctx.auth.orgId, requesterId, notification));
}

export async function approveDeletionRequest(
	ctx: DeletionRequestReviewContext,
	requestId: string,
	effects: ApprovedDeletionEffects
): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);

	const request = await fetchPendingRequest(ctx, requestId);
	const boundRequestId = request.id;

	const resourceType = request.resource_type;
	const resourceId = request.resource_id;

	if (!isSupportedResourceType(resourceType)) {
		fail(400, `Unsupported resource type: ${resourceType}`);
	}

	if (resourceType === 'counseling_record') {
		// The source-owned 012 transaction acknowledges its row and request status together.
		await effects.approveCounseling(boundRequestId, resourceId, new Date().toISOString());
	} else {
		if (resourceType === 'personnel') await effects.archivePersonnel(resourceId);
		else if (resourceType === 'training_type') await effects.deleteTrainingType(boundRequestId, resourceId);
		else if (resourceType === 'personnel_training') await effects.deleteTrainingRecord(boundRequestId, resourceId);
		else if (resourceType === 'rating_scheme_entry') await effects.deleteRatingEntry(boundRequestId, resourceId);
		// Effects can persist even if another terminal writer wins this status transition.
		const completed = await ctx.store.completePendingReview(
			ctx.auth.orgId,
			boundRequestId,
			{ resourceType, resourceId },
			{ status: 'approved', reviewedBy: ctx.auth.userId, reviewedAt: new Date().toISOString(), denialReason: null }
		);
		if (!completed) fail(404, 'Pending deletion request not found');
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
		resourceId: boundRequestId,
		details: {
			...reviewerDetails(ctx.auth.userId),
			...subjectDetails({
				subjectType: resourceType,
				subjectId: resourceId,
				subjectLabel: request.resource_description
			})
		}
	});
}

export async function denyDeletionRequest(
	ctx: DeletionRequestReviewContext,
	requestId: string,
	reason?: string
): Promise<void> {
	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.reviewDeletionRequests);

	const request = await fetchPendingRequest(ctx, requestId);
	const boundRequestId = request.id;

	const completed = await ctx.store.completePendingReview(
		ctx.auth.orgId,
		boundRequestId,
		{ resourceType: request.resource_type, resourceId: request.resource_id },
		{
			status: 'denied',
			reviewedBy: ctx.auth.userId,
			reviewedAt: new Date().toISOString(),
			denialReason: reason ?? null
		}
	);
	if (!completed) fail(404, 'Pending deletion request not found');

	const resourceType = request.resource_type;
	const isPersonnel = resourceType === 'personnel';
	const actionWordCap = isPersonnel ? 'Archival' : 'Deletion';
	const actionWord = isPersonnel ? 'archive' : 'delete';

	notifyRequester(ctx, request, {
		type: 'deletion_denied',
		title: `${actionWordCap} Denied`,
		message: `Your request to ${actionWord} "${request.resource_description}" has been denied.${reason ? ` Reason: ${reason}` : ''}`,
		link: request.resource_url
	});

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.denied`,
		resourceType: AUDIT_RESOURCE,
		resourceId: boundRequestId,
		details: {
			...reviewerDetails(ctx.auth.userId),
			...subjectDetails({
				subjectType: resourceType,
				subjectId: request.resource_id,
				subjectLabel: request.resource_description
			}),
			denial_reason: reason ?? null
		}
	});
}
