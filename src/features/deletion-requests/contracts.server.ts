import type { DeletionRequest, PendingDeletionRequestSummary } from './contracts';

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

/** Delivery closes over the admitted actor and source-owned operations. */
export interface ApprovedDeletionEffects {
	archivePersonnel(personnelId: string): Promise<void>;
	deleteTrainingType(requestId: string, typeId: string): Promise<void>;
	deleteTrainingRecord(requestId: string, recordId: string): Promise<void>;
	deleteRatingEntry(requestId: string, entryId: string): Promise<void>;
	approveCounseling(requestId: string, recordId: string, reviewedAt: string): Promise<void>;
}
