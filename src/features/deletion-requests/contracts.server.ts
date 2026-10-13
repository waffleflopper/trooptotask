import type { DeletionRequest, PendingDeletionRequestSummary } from './contracts';
import type { FileCleanup } from '$features/organization/contracts';

export interface PendingDeletionTarget {
	resourceType: string;
	resourceId: string;
}

export interface DeletionRequestReview {
	status: 'approved' | 'denied';
	reviewedBy: string;
	reviewedAt: string;
	denialReason: string | null;
}

/** Named operations over the admitted ordinary request client's visible rows. */
export interface DeletionRequestStore {
	findPendingById(orgId: string, requestId: string, target?: PendingDeletionTarget): Promise<DeletionRequest | null>;
	listRequests(orgId: string, filter: { status?: string; requestedBy?: string }): Promise<DeletionRequest[]>;
	readPendingSummary(orgId: string, requestedBy?: string): Promise<PendingDeletionRequestSummary>;
	completePendingReview(
		orgId: string,
		requestId: string,
		target: PendingDeletionTarget,
		review: DeletionRequestReview
	): Promise<boolean>;
	listExportRows(orgId: string): Promise<Record<string, unknown>[]>;
}

/**
 * Requests are created only after the owning feature loads the target with the
 * requester's access. The provider sees every pending request in the
 * Organization, so a duplicate filed by another member is still found.
 */
export interface DeletionRequestSubmissionPort {
	findPendingByResource(orgId: string, resourceType: string, resourceId: string): Promise<{ id: string } | null>;
	createRequest(
		orgId: string,
		input: {
			requestedBy: string;
			requesterEmail: string;
			resourceType: string;
			resourceId: string;
			description: string;
			resourceUrl: string | null;
		}
	): Promise<DeletionRequest>;
}

/**
 * Delivery closes over the admitted actor and source-owned operations. Training
 * type, Training record and Rating entry approvals delete the target and approve
 * the request in one transaction, so a target missing from the Organization
 * leaves the request pending. Personnel approval archives the Person, then
 * writes the request status separately. Counseling approval deletes the record
 * and approves the request in one transaction, then removes the stored file or
 * leaves it for scheduled cleanup.
 */
export interface ApprovedDeletionEffects {
	archivePersonnel(personnelId: string): Promise<void>;
	approveTrainingType(requestId: string, typeId: string, reviewedAt: string): Promise<void>;
	approveTrainingRecord(requestId: string, recordId: string, reviewedAt: string): Promise<void>;
	approveRatingEntry(requestId: string, entryId: string, reviewedAt: string): Promise<void>;
	approveCounseling(requestId: string, recordId: string, reviewedAt: string): Promise<{ fileCleanup: FileCleanup }>;
}
